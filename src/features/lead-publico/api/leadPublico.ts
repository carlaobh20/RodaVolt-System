import { supabase } from '@/shared/lib/supabase';
import type { LeadPublicoFormValues } from '../schemas/leadPublico.schema';
import { MAX_DOC_BYTES, MIME_DOC_OK } from '../schemas/leadPublico.schema';

// Cliente do funil público (migration 0053). Espelha o mesmo padrão de segurança de
// motorista-app/api/uploads.ts (nome de arquivo saneado, compressão de imagem, path com uuid
// pra evitar colisão/path traversal) — só que aqui não existe sessão: o "documento de
// identidade" de quem está subindo o arquivo é o par (empresa_id, motorista_id) que a RPC
// devolveu, validado no banco por fn_lead_publico_valido a cada upload.

export type DadosLeadPublico = Omit<LeadPublicoFormValues, 'website'>;

function nomeSeguro(nome: string): string {
  return nome.replace(/[^\w.-]+/g, '_').slice(-80) || 'arquivo';
}

async function comprimirSePreciso(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const max = 1600;
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.8));
}

export function validarDocumento(file: File) {
  if (!MIME_DOC_OK.includes(file.type)) throw new Error('Formato não permitido. Use JPG, PNG, WEBP ou PDF.');
  if (file.size > MAX_DOC_BYTES) throw new Error('Arquivo grande demais (máximo 8 MB).');
}

// "Sim"/"Não" de <select> vira boolean | undefined antes de ir pro RPC (undefined quando o
// candidato deixou "Selecione" / não respondeu — a RPC trata undefined como "não informado",
// nunca como false).
function paraBooleano(v: string | undefined): boolean | undefined {
  if (v === 'sim') return true;
  if (v === 'nao') return false;
  return undefined;
}

// 1) Cria (ou atualiza, se ainda for lead) o motorista + a ficha de triagem via RPC. Nunca faz
// INSERT direto nas tabelas — esse é o único caminho de escrita liberado pro visitante anônimo
// (ver comentário da migration 0053 sobre por que não existe policy de INSERT direta).
export async function criarLeadPublico(dados: DadosLeadPublico): Promise<{ motoristaId: string; empresaId: string }> {
  const observacoes = [
    dados.veiculoInteresse ? `Veículo de interesse: ${dados.veiculoInteresse}` : null,
    dados.observacoes || null,
  ]
    .filter(Boolean)
    .join(' — ');

  const { data, error } = await supabase.rpc('criar_lead_publico', {
    p: {
      // motoristas
      nome_completo: dados.nome_completo,
      cpf: dados.cpf,
      email: dados.email,
      telefone: dados.telefone,
      data_nascimento: dados.data_nascimento,
      cnh_numero: dados.cnh_numero,
      cnh_categoria: dados.cnh_categoria,
      cnh_validade: dados.cnh_validade,
      endereco: dados.endereco,
      cidade: dados.cidade,
      estado: dados.estado,
      observacoes: observacoes || undefined,

      // motoristas_triagem
      rg: dados.rg,
      estado_civil: dados.estado_civil,
      cep: dados.cep,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      cnh_ear: paraBooleano(dados.cnh_ear),
      ja_dirige_app: paraBooleano(dados.ja_dirige_app),
      tempo_experiencia: dados.tempo_experiencia,
      apps_utilizados: dados.apps_utilizados ?? [],
      km_semanal_km: dados.km_semanal_km,
      possui_veiculo_proprio: paraBooleano(dados.possui_veiculo_proprio),
      disponibilidade_horas: dados.disponibilidade_horas,
      referencia_nome: dados.referencia_nome,
      referencia_telefone: dados.referencia_telefone,
      contato_emergencia_nome: dados.contato_emergencia_nome,
      contato_emergencia_telefone: dados.contato_emergencia_telefone,
      quando_pretende_comecar: dados.quando_pretende_comecar,
      melhor_horario_contato: dados.melhor_horario_contato,
      aceitou_politica_privacidade: dados.aceitou_politica_privacidade,

      // RodaScore v1.0 (migration 0054) — Histórico de locações + Capacidade financeira
      ja_alugou_veiculo_antes: paraBooleano(dados.ja_alugou_veiculo_antes),
      locacao_anterior_sem_pendencias: paraBooleano(dados.locacao_anterior_sem_pendencias),
      locacao_anterior_motivo_saida: dados.locacao_anterior_motivo_saida,
      renda_mensal_declarada: dados.renda_mensal_declarada,
      possui_outra_fonte_renda: paraBooleano(dados.possui_outra_fonte_renda),
      possui_conta_bancaria: paraBooleano(dados.possui_conta_bancaria),
    },
  });
  if (error) throw error;

  const resultado = data as { id: string; empresa_id: string };
  if (!resultado?.id || !resultado?.empresa_id) {
    throw new Error('Não foi possível concluir o cadastro. Tente novamente.');
  }
  return { motoristaId: resultado.id, empresaId: resultado.empresa_id };
}

// 2) Envia um documento pro Storage + registra em `arquivos`. Só funciona nas primeiras 24h
// depois da criação do lead (fn_lead_publico_valido) — é por isso que o upload acontece logo
// em seguida da criarLeadPublico, na mesma submissão do formulário, nunca depois.
export async function enviarDocumentoLeadPublico(
  file: File,
  categoria: string,
  empresaId: string,
  motoristaId: string
): Promise<void> {
  validarDocumento(file);
  const blob = await comprimirSePreciso(file);
  const nome = nomeSeguro(file.name);
  const path = `${empresaId}/${motoristaId}/${crypto.randomUUID()}-${nome}`;

  const { error: erroUp } = await supabase.storage.from('motoristas-documentos').upload(path, blob, {
    contentType: blob.type || file.type,
    upsert: false,
  });
  if (erroUp) throw erroUp;

  const { error: erroArq } = await supabase.from('arquivos').insert({
    empresa_id: empresaId,
    entidade_tipo: 'motorista',
    entidade_id: motoristaId,
    categoria,
    nome_arquivo: nome,
    caminho_storage: `motoristas-documentos/${path}`,
    tipo_mime: blob.type || file.type,
    tamanho_bytes: blob.size,
    usuario_id: null,
    status_revisao: 'aguardando',
  });
  if (erroArq) throw erroArq;
}
