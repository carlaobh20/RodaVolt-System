import { supabase } from '@/shared/lib/supabase';

// Cliente do RodaScore v1.0 (migration 0054). Todo cálculo acontece em SQL
// (fn_calcular_rodascore) — este arquivo só LÊ o resultado já calculado e chama as 3 RPCs
// autenticadas que existem (recalcular, registrar entrevista, registrar decisão). Nunca
// recalcula nem escreve score no cliente — ver o comentário de por que isso é proposital na
// própria migration.

export type RodaScoreFaixa = 'forte' | 'analise' | 'alto_risco' | 'nao_priorizar';

export type RodaScoreResultado = {
  motorista_id: string;
  empresa_id: string;
  config_id: string;
  score_documentacao: number;
  score_cnh: number;
  score_apps: number;
  score_locacoes: number;
  score_financeiro: number;
  score_operacional: number;
  score_consistencia_referencias: number;
  score_entrevista: number | null;
  entrevista_pendente: boolean;
  total: number;
  faixa: RodaScoreFaixa | null;
  calculado_em: string;
};

export type RodaScoreFlagSeveridade = 'critica' | 'atencao';

export type RodaScoreFlag = {
  id: string;
  motorista_id: string;
  codigo: string;
  descricao: string;
  severidade: RodaScoreFlagSeveridade;
  origem: 'automatica' | 'manual';
  resolvida: boolean;
  resolvida_em: string | null;
  criado_em: string;
};

export type MotoristaEntrevista = {
  motorista_id: string;
  nota: number;
  observacoes: string | null;
  entrevistado_por: string | null;
  atualizado_em: string;
};

export type MotoristaDecisaoTipo = 'aprovar' | 'reprovar' | 'solicitar_mais_informacao' | 'manter_em_analise';

export type MotoristaDecisao = {
  id: string;
  motorista_id: string;
  tipo_decisao: MotoristaDecisaoTipo;
  justificativa: string;
  usuario_id: string;
  criado_em: string;
};

export async function getRodaScoreResultado(motoristaId: string): Promise<RodaScoreResultado | null> {
  const { data, error } = await supabase.from('rodascore_resultado').select('*').eq('motorista_id', motoristaId).maybeSingle();
  if (error) throw error;
  return data as RodaScoreResultado | null;
}

export async function listRodaScoreFlags(motoristaId: string): Promise<RodaScoreFlag[]> {
  const { data, error } = await supabase
    .from('rodascore_flags')
    .select('*')
    .eq('motorista_id', motoristaId)
    .order('resolvida', { ascending: true })
    .order('severidade', { ascending: true })
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data as RodaScoreFlag[];
}

export async function getMotoristaEntrevista(motoristaId: string): Promise<MotoristaEntrevista | null> {
  const { data, error } = await supabase.from('motorista_entrevista').select('*').eq('motorista_id', motoristaId).maybeSingle();
  if (error) throw error;
  return data as MotoristaEntrevista | null;
}

export async function listMotoristaDecisoes(motoristaId: string): Promise<MotoristaDecisao[]> {
  const { data, error } = await supabase
    .from('motorista_decisoes')
    .select('*')
    .eq('motorista_id', motoristaId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data as MotoristaDecisao[];
}

export async function recalcularRodaScore(motoristaId: string): Promise<void> {
  const { error } = await supabase.rpc('recalcular_rodascore', { p_motorista_id: motoristaId });
  if (error) throw error;
}

export async function registrarEntrevista(motoristaId: string, nota: number, observacoes: string): Promise<void> {
  const { error } = await supabase.rpc('registrar_entrevista_rodascore', {
    p_motorista_id: motoristaId,
    p_nota: nota,
    p_observacoes: observacoes || null,
  });
  if (error) throw error;
}

export async function registrarDecisao(motoristaId: string, tipoDecisao: MotoristaDecisaoTipo, justificativa: string): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_decisao_motorista', {
    p_motorista_id: motoristaId,
    p_tipo_decisao: tipoDecisao,
    p_justificativa: justificativa,
  });
  if (error) throw error;
  return data as string;
}

export async function resolverFlag(flagId: string, usuarioId: string | undefined): Promise<void> {
  const { error } = await supabase
    .from('rodascore_flags')
    .update({ resolvida: true, resolvida_em: new Date().toISOString(), resolvida_por: usuarioId ?? null })
    .eq('id', flagId);
  if (error) throw error;
}

export async function criarFlagManual(
  motoristaId: string,
  empresaId: string,
  descricao: string,
  severidade: RodaScoreFlagSeveridade,
  usuarioId: string | undefined
): Promise<void> {
  const { error } = await supabase.from('rodascore_flags').insert({
    motorista_id: motoristaId,
    empresa_id: empresaId,
    codigo: 'manual',
    descricao,
    severidade,
    origem: 'manual',
    criado_por: usuarioId ?? null,
  });
  if (error) throw error;
}

// Painel "Candidatos" (pedido do Carlos: "painel admin RodaVolt candidatos com filtros e
// cards"). `!inner` em rodascore_resultado é o que define "candidato" aqui: só motorista com
// score já calculado entra na lista — quem ainda não tem `rodascore_resultado` (motorista
// antigo, cadastrado antes da migration 0054, sem nenhum dado de triagem) fica de fora, porque
// não tem o que mostrar. Filtro por faixa/flag/busca é feito no cliente (useCandidatosRodaScore)
// — lista de candidatos tende a ser pequena o bastante pra isso não pesar, e evita depender de
// sintaxe de filtro em recurso embutido do PostgREST que eu não consegui validar contra o banco
// real nesta sessão (sandbox sem acesso à rede do Supabase).
export type CandidatoRodaScore = {
  id: string;
  nome_completo: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  status: string;
  origem_lead: string | null;
  criado_em: string;
  rodascore_resultado: RodaScoreResultado;
  rodascore_flags: { id: string; severidade: RodaScoreFlagSeveridade; resolvida: boolean }[];
};

export async function listCandidatosRodaScore(): Promise<CandidatoRodaScore[]> {
  const { data, error } = await supabase
    .from('motoristas')
    .select(
      'id, nome_completo, telefone, email, cidade, status, origem_lead, criado_em, rodascore_resultado!inner(*), rodascore_flags(id, severidade, resolvida)'
    )
    .order('criado_em', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((m) => {
    const resultadoRaw = (m as unknown as { rodascore_resultado: RodaScoreResultado | RodaScoreResultado[] }).rodascore_resultado;
    const rodascore_resultado = Array.isArray(resultadoRaw) ? resultadoRaw[0] : resultadoRaw;
    return { ...m, rodascore_resultado } as CandidatoRodaScore;
  });
}
