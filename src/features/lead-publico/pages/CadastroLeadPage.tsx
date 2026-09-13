import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Mail, Pencil, ShieldCheck, Upload, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';
import { toast, extrairMensagemDeErro } from '@/shared/components/ui/toast';
import {
  leadPublicoSchema,
  DOCUMENTOS_OBRIGATORIOS,
  APPS_MOTORISTA,
  TEMPO_EXPERIENCIA_OPCOES,
  DISPONIBILIDADE_OPCOES,
  WIZARD_ETAPAS,
  type LeadPublicoFormInput,
  type LeadPublicoFormValues,
} from '../schemas/leadPublico.schema';
import { criarLeadPublico, enviarDocumentoLeadPublico, validarDocumento } from '../api/leadPublico';
import rodavoltLogo from '../assets/rodavolt-logo-preto.svg';
import motoristaPhoto from '../assets/motorista-login.jpg';

// Página pública do funil: quem clica em "Quero alugar" / "Quero meu Carro Elétrico" na
// landing cai aqui, preenche a ficha de triagem completa (Carlos: "não podemos errar na
// contratação"), anexa os documentos, e vira um motorista novo na etapa "Novo Lead" do Kanban
// (migration 0053) — com um RodaScore calculado automaticamente no servidor (migration 0054).
//
// Virou WIZARD de 9 etapas nesta versão (pedido do Carlos, junto com o RodaScore): mobile-first,
// barra de progresso, uma seção por vez. Cada etapa só valida os próprios campos
// (`trigger(campos da etapa)`) antes de liberar "Avançar" — o candidato nunca vê erro de uma
// etapa que ainda nem chegou. A validação completa (zodResolver) só roda de fato no envio final,
// na etapa 9 (Revisão).
//
// Visual continua o mesmo do mockup aprovado pelo Carlos: tema claro, faixa escura no topo,
// coluna esquerda fixa (foto + "como funciona" + selo), coluna direita agora com o wizard.

const fieldClass =
  'h-11 border-neutral-300 bg-white text-[15px] text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-300 dark:bg-white dark:text-neutral-900 dark:placeholder:text-neutral-400 focus-visible:ring-[#2389FF] focus-visible:ring-offset-0';
const labelClass = 'mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-600';

function SectionHeader({ numero, titulo }: { numero: string; titulo: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2389FF] text-sm font-bold text-white">
        {numero}
      </span>
      <h2 className="text-base font-bold text-neutral-900">{titulo}</h2>
    </div>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <Label className={labelClass}>{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

type DocKey = (typeof DOCUMENTOS_OBRIGATORIOS)[number]['categoria'] | 'Outro';

function CampoDoc({
  label,
  obrigatorio,
  file,
  onSelect,
  onRemove,
}: {
  label: string;
  obrigatorio: boolean;
  file: File | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      validarDocumento(f);
      onSelect(f);
    } catch (err) {
      toast.error(extrairMensagemDeErro(err));
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div>
      <Label className={labelClass}>
        {label} {obrigatorio && <span className="text-red-600">*</span>}
      </Label>
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-[#2389FF]" />
            <span className="truncate text-sm text-neutral-800">{file.name}</span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover arquivo"
            className="shrink-0 rounded p-1 text-neutral-400 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 hover:border-[#2389FF] hover:text-[#2389FF]">
          <Upload className="h-4 w-4" />
          Selecionar arquivo
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleChange} />
        </label>
      )}
    </div>
  );
}

const COMO_FUNCIONA = [
  { titulo: 'Envie seus dados', desc: 'Preencha o formulário completo e anexe seus documentos.' },
  { titulo: 'Aguarde nossa análise', desc: 'Nossa equipe confere seus dados e documentos com atenção.' },
  { titulo: 'Após aprovação, combine a retirada', desc: 'Com tudo certo, combinamos os próximos passos para você pegar seu carro.' },
];

const TOTAL_ETAPAS = WIZARD_ETAPAS.length;

function ProgressoWizard({ etapaAtual }: { etapaAtual: number }) {
  const pct = Math.round((etapaAtual / TOTAL_ETAPAS) * 100);
  const titulo = WIZARD_ETAPAS.find((e) => e.numero === etapaAtual)?.titulo ?? '';
  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
        <span>
          Etapa {etapaAtual} de {TOTAL_ETAPAS} — {titulo}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full rounded-full bg-[#2389FF] transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ResumoLinha({ label, valor }: { label: string; valor: ReactNode }) {
  if (valor === undefined || valor === null || valor === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{valor}</span>
    </div>
  );
}

function ResumoSecao({ titulo, etapa, onEditar, children }: { titulo: string; etapa: number; onEditar: (etapa: number) => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-neutral-900">{titulo}</p>
        <button
          type="button"
          onClick={() => onEditar(etapa)}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#2389FF] hover:underline"
        >
          <Pencil className="h-3 w-3" /> Editar
        </button>
      </div>
      <div className="divide-y divide-neutral-100">{children}</div>
    </div>
  );
}

const SIM_NAO_LABEL: Record<string, string> = { sim: 'Sim', nao: 'Não' };

export function CadastroLeadPage() {
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [docs, setDocs] = useState<Partial<Record<DocKey, File>>>({});
  const [etapaAtual, setEtapaAtual] = useState(1);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors },
  } = useForm<LeadPublicoFormInput, unknown, LeadPublicoFormValues>({
    resolver: zodResolver(leadPublicoSchema),
    defaultValues: { apps_utilizados: [] },
    mode: 'onSubmit',
  });

  const valores = watch();
  const jaAlugouAntes = watch('ja_alugou_veiculo_antes');

  async function irParaEtapa(destino: number) {
    setEtapaAtual(destino);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function avancar() {
    const etapa = WIZARD_ETAPAS.find((e) => e.numero === etapaAtual);
    const ok = etapa && etapa.campos.length > 0 ? await trigger(etapa.campos as (keyof LeadPublicoFormInput)[]) : true;
    if (!ok) return;

    if (etapaAtual === 8) {
      const faltando = DOCUMENTOS_OBRIGATORIOS.filter((d) => !docs[d.categoria]);
      if (faltando.length > 0) {
        toast.error('Documentos obrigatórios faltando', faltando.map((d) => d.label).join(', '));
        return;
      }
    }
    irParaEtapa(Math.min(etapaAtual + 1, TOTAL_ETAPAS));
  }

  function voltar() {
    irParaEtapa(Math.max(etapaAtual - 1, 1));
  }

  async function onSubmit(values: LeadPublicoFormValues) {
    // Honeypot: campo escondido (register('website') mais abaixo) — só bot preenche.
    // Silencioso de propósito: finge sucesso, não salva nada.
    if (values.website) {
      setEnviado(true);
      return;
    }

    const faltando = DOCUMENTOS_OBRIGATORIOS.filter((d) => !docs[d.categoria]);
    if (faltando.length > 0) {
      toast.error('Documentos obrigatórios faltando', faltando.map((d) => d.label).join(', '));
      irParaEtapa(8);
      return;
    }

    setEnviando(true);
    try {
      const { motoristaId, empresaId } = await criarLeadPublico(values);

      for (const [categoria, file] of Object.entries(docs)) {
        if (!file) continue;
        await enviarDocumentoLeadPublico(file, categoria, empresaId, motoristaId);
      }

      setEnviado(true);
    } catch (err) {
      toast.error('Não foi possível concluir o cadastro', extrairMensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-[#00C076]" />
          <h1 className="mt-5 text-2xl font-bold text-neutral-900">Cadastro recebido!</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Recebemos seus dados e documentos. Nossa equipe vai analisar seu cadastro e entrar em contato pelo
            telefone ou e-mail informados.
          </p>
          <Link
            to="/"
            className={cn(
              'mt-8 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#2389FF] px-6 font-bold text-white hover:bg-[#1B6FDB]'
            )}
          >
            Voltar ao site
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <img src={rodavoltLogo} alt="RodaVolt" className="h-6 w-auto sm:h-7" />
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2389FF] hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao site
          </Link>
        </div>
      </header>

      <div className="bg-[#05070B] px-4 py-10 sm:px-8 sm:py-14">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-widest text-[#2389FF]">Seu próximo passo</p>
          <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Quero alugar meu carro elétrico</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Preencha seus dados para nossa equipe conhecer você.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
          {/* Coluna esquerda */}
          <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
            <div className="relative overflow-hidden rounded-2xl">
              <img src={motoristaPhoto} alt="Motorista sorridente com o app RodaVolt no celular" className="h-64 w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="text-lg font-bold">Mais que um carro, uma nova oportunidade.</p>
                <p className="mt-1 text-sm text-zinc-300">Dirija o futuro com a RodaVolt.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Como funciona</p>
              <div className="mt-4 space-y-4">
                {COMO_FUNCIONA.map((passo, i) => (
                  <div key={passo.titulo} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2389FF] text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{passo.titulo}</p>
                      <p className="text-sm text-neutral-500">{passo.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#2389FF]/20 bg-[#2389FF]/5 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-6 w-6 shrink-0 text-[#2389FF]" />
                <div>
                  <p className="text-sm font-bold text-neutral-900">Cadastro para análise</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    O envio não libera acesso ao app. O login de motorista é exclusivo para aprovados que já estão
                    rodando com a RodaVolt.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna direita — wizard */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-8">
            <h2 className="text-xl font-black text-neutral-900">Vamos conhecer você</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Preencha os dados abaixo com atenção — quanto mais completo, mais rápida a nossa análise.
            </p>

            <ProgressoWizard etapaAtual={etapaAtual} />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* honeypot — invisível para humano, sempre montado independente da etapa */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                className="pointer-events-none absolute h-0 w-0 opacity-0"
                aria-hidden="true"
                {...register('website')}
              />

              {etapaAtual === 1 && (
                <section className="space-y-6">
                  <div>
                    <SectionHeader numero="01" titulo="Dados pessoais" />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Campo label="Nome completo *" error={errors.nome_completo?.message}>
                        <Input className={fieldClass} {...register('nome_completo')} />
                      </Campo>
                      <Campo label="CPF *" error={errors.cpf?.message}>
                        <Input className={fieldClass} placeholder="000.000.000-00" {...register('cpf')} />
                      </Campo>
                      <Campo label="RG">
                        <Input className={fieldClass} {...register('rg')} />
                      </Campo>
                      <Campo label="Data de nascimento *" error={errors.data_nascimento?.message}>
                        <Input type="date" className={fieldClass} {...register('data_nascimento')} />
                      </Campo>
                      <Campo label="Estado civil">
                        <Select className={fieldClass} defaultValue="" {...register('estado_civil')}>
                          <option value="">Selecione</option>
                          <option value="solteiro">Solteiro(a)</option>
                          <option value="casado">Casado(a) / União estável</option>
                          <option value="divorciado">Divorciado(a)</option>
                          <option value="viuvo">Viúvo(a)</option>
                          <option value="outro">Outro</option>
                        </Select>
                      </Campo>
                      <Campo label="WhatsApp *" error={errors.telefone?.message}>
                        <Input className={fieldClass} placeholder="(11) 91234-5678" {...register('telefone')} />
                      </Campo>
                      <Campo label="E-mail *" error={errors.email?.message}>
                        <Input type="email" className={fieldClass} {...register('email')} />
                      </Campo>
                    </div>
                  </div>

                  <div>
                    <p className="mb-4 text-sm font-bold text-neutral-900">Endereço</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <Campo label="CEP">
                        <Input className={fieldClass} placeholder="00000-000" {...register('cep')} />
                      </Campo>
                      <div className="sm:col-span-2">
                        <Campo label="Endereço *" error={errors.endereco?.message}>
                          <Input className={fieldClass} {...register('endereco')} />
                        </Campo>
                      </div>
                      <Campo label="Número">
                        <Input className={fieldClass} {...register('numero')} />
                      </Campo>
                      <Campo label="Complemento">
                        <Input className={fieldClass} {...register('complemento')} />
                      </Campo>
                      <Campo label="Bairro">
                        <Input className={fieldClass} {...register('bairro')} />
                      </Campo>
                      <Campo label="Cidade *" error={errors.cidade?.message}>
                        <Input className={fieldClass} {...register('cidade')} />
                      </Campo>
                      <Campo label="Estado *" error={errors.estado?.message}>
                        <Input className={fieldClass} placeholder="UF" maxLength={2} {...register('estado')} />
                      </Campo>
                    </div>
                  </div>
                </section>
              )}

              {etapaAtual === 2 && (
                <section>
                  <SectionHeader numero="02" titulo="CNH" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <Campo label="Número *" error={errors.cnh_numero?.message}>
                      <Input className={fieldClass} {...register('cnh_numero')} />
                    </Campo>
                    <Campo label="Categoria *" error={errors.cnh_categoria?.message}>
                      <Input className={fieldClass} placeholder="AB" {...register('cnh_categoria')} />
                    </Campo>
                    <Campo label="Validade *" error={errors.cnh_validade?.message}>
                      <Input type="date" className={fieldClass} {...register('cnh_validade')} />
                    </Campo>
                    <Campo label="Possui CNH com EAR?">
                      <Select className={fieldClass} defaultValue="" {...register('cnh_ear')}>
                        <option value="">Selecione</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </Select>
                    </Campo>
                  </div>
                </section>
              )}

              {etapaAtual === 3 && (
                <section>
                  <SectionHeader numero="03" titulo="Experiência em apps" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Já trabalha como motorista de aplicativo?">
                      <Select className={fieldClass} defaultValue="" {...register('ja_dirige_app')}>
                        <option value="">Selecione</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </Select>
                    </Campo>
                    <Campo label="Há quanto tempo?">
                      <Select className={fieldClass} defaultValue="" {...register('tempo_experiencia')}>
                        <option value="">Selecione</option>
                        {TEMPO_EXPERIENCIA_OPCOES.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                  </div>
                  <div className="mt-4">
                    <Label className={labelClass}>Em quais aplicativos você roda?</Label>
                    <div className="flex flex-wrap gap-4">
                      {APPS_MOTORISTA.map((app) => (
                        <label key={app} className="flex items-center gap-2 text-sm text-neutral-700">
                          <input type="checkbox" value={app} className="h-4 w-4 rounded border-neutral-300 accent-[#2389FF]" {...register('apps_utilizados')} />
                          {app}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Km rodados por semana (aprox.)" error={errors.km_semanal_km?.message}>
                      <Input type="number" min={0} className={fieldClass} placeholder="Ex.: 800" {...register('km_semanal_km')} />
                    </Campo>
                  </div>
                </section>
              )}

              {etapaAtual === 4 && (
                <section>
                  <SectionHeader numero="04" titulo="Histórico de locações" />
                  <p className="mb-4 text-xs text-neutral-500">
                    Ajuda nossa equipe a entender sua experiência anterior com locação de veículo — nenhuma resposta aqui elimina o cadastro sozinha.
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Já alugou um veículo de locadora antes?">
                      <Select className={fieldClass} defaultValue="" {...register('ja_alugou_veiculo_antes')}>
                        <option value="">Selecione</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </Select>
                    </Campo>
                    {jaAlugouAntes === 'sim' && (
                      <Campo label="Encerrou o contrato anterior sem pendências (multas, avarias, inadimplência)?">
                        <Select className={fieldClass} defaultValue="" {...register('locacao_anterior_sem_pendencias')}>
                          <option value="">Selecione</option>
                          <option value="sim">Sim</option>
                          <option value="nao">Não</option>
                        </Select>
                      </Campo>
                    )}
                  </div>
                  {jaAlugouAntes === 'sim' && (
                    <div className="mt-4">
                      <Campo label="Quer contar mais sobre essa locação anterior? (opcional)">
                        <Textarea rows={3} className={fieldClass} {...register('locacao_anterior_motivo_saida')} />
                      </Campo>
                    </div>
                  )}
                </section>
              )}

              {etapaAtual === 5 && (
                <section>
                  <SectionHeader numero="05" titulo="Capacidade financeira" />
                  <p className="mb-4 text-xs text-neutral-500">
                    Usamos isso só para avaliar sua capacidade de pagar o aluguel semanal — não para julgar sua renda.
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Renda mensal aproximada (R$)" error={errors.renda_mensal_declarada?.message}>
                      <Input type="number" min={0} className={fieldClass} placeholder="Ex.: 3000" {...register('renda_mensal_declarada')} />
                    </Campo>
                    <Campo label="Possui outra fonte de renda além de dirigir?">
                      <Select className={fieldClass} defaultValue="" {...register('possui_outra_fonte_renda')}>
                        <option value="">Selecione</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </Select>
                    </Campo>
                    <Campo label="Possui conta bancária em seu nome?">
                      <Select className={fieldClass} defaultValue="" {...register('possui_conta_bancaria')}>
                        <option value="">Selecione</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </Select>
                    </Campo>
                  </div>
                </section>
              )}

              {etapaAtual === 6 && (
                <section>
                  <SectionHeader numero="06" titulo="Perfil operacional" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Possui veículo próprio hoje?">
                      <Select className={fieldClass} defaultValue="" {...register('possui_veiculo_proprio')}>
                        <option value="">Selecione</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </Select>
                    </Campo>
                    <Campo label="Disponibilidade">
                      <Select className={fieldClass} defaultValue="" {...register('disponibilidade_horas')}>
                        <option value="">Selecione</option>
                        {DISPONIBILIDADE_OPCOES.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    <Campo label="Quando pretende começar?">
                      <Select className={fieldClass} defaultValue="" {...register('quando_pretende_comecar')}>
                        <option value="">Selecione</option>
                        <option value="imediatamente">Imediatamente</option>
                        <option value="15_dias">Em até 15 dias</option>
                        <option value="30_dias">Em até 30 dias</option>
                        <option value="outro">Ainda não sei</option>
                      </Select>
                    </Campo>
                    <Campo label="Melhor horário para contato">
                      <Select className={fieldClass} defaultValue="" {...register('melhor_horario_contato')}>
                        <option value="">Selecione</option>
                        <option value="manha">Manhã</option>
                        <option value="tarde">Tarde</option>
                        <option value="noite">Noite</option>
                        <option value="qualquer">Qualquer horário</option>
                      </Select>
                    </Campo>
                  </div>
                  <div className="mt-4">
                    <Campo label="Qual carro você tem interesse? (opcional)">
                      <Input className={fieldClass} placeholder="Ex.: modelo visto no comparador" {...register('veiculoInteresse')} />
                    </Campo>
                  </div>
                  <div className="mt-4">
                    <Campo label="Quer contar algo mais? (opcional)">
                      <Textarea rows={3} className={fieldClass} {...register('observacoes')} />
                    </Campo>
                  </div>
                </section>
              )}

              {etapaAtual === 7 && (
                <section>
                  <SectionHeader numero="07" titulo="Referências" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo label="Nome de uma referência pessoal">
                      <Input className={fieldClass} {...register('referencia_nome')} />
                    </Campo>
                    <Campo label="Telefone da referência">
                      <Input className={fieldClass} {...register('referencia_telefone')} />
                    </Campo>
                    <Campo label="Contato de emergência — nome">
                      <Input className={fieldClass} {...register('contato_emergencia_nome')} />
                    </Campo>
                    <Campo label="Contato de emergência — telefone">
                      <Input className={fieldClass} {...register('contato_emergencia_telefone')} />
                    </Campo>
                  </div>
                </section>
              )}

              {etapaAtual === 8 && (
                <section>
                  <SectionHeader numero="08" titulo="Documentos e consentimento" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {DOCUMENTOS_OBRIGATORIOS.map((d) => (
                      <CampoDoc
                        key={d.categoria}
                        label={d.label}
                        obrigatorio
                        file={docs[d.categoria] ?? null}
                        onSelect={(file) => setDocs((prev) => ({ ...prev, [d.categoria]: file }))}
                        onRemove={() => setDocs((prev) => ({ ...prev, [d.categoria]: undefined }))}
                      />
                    ))}
                    <CampoDoc
                      label="Outro documento (opcional)"
                      obrigatorio={false}
                      file={docs.Outro ?? null}
                      onSelect={(file) => setDocs((prev) => ({ ...prev, Outro: file }))}
                      onRemove={() => setDocs((prev) => ({ ...prev, Outro: undefined }))}
                    />
                  </div>

                  <div className="mt-6 border-t border-neutral-200 pt-6">
                    <label className="flex items-start gap-2.5 text-sm text-neutral-600">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-[#2389FF]"
                        {...register('aceitou_politica_privacidade')}
                      />
                      <span>
                        Li a{' '}
                        <Link to="/politica-privacidade" target="_blank" className="text-[#2389FF] hover:underline">
                          Política de Privacidade
                        </Link>{' '}
                        e estou ciente do uso dos meus dados para análise e contato sobre esta solicitação.
                      </span>
                    </label>
                    {errors.aceitou_politica_privacidade && (
                      <p className="mt-1 text-xs text-red-600">{errors.aceitou_politica_privacidade.message}</p>
                    )}
                  </div>
                </section>
              )}

              {etapaAtual === 9 && (
                <section className="space-y-4">
                  <SectionHeader numero="09" titulo="Revisão" />
                  <p className="text-sm text-neutral-500">Confira seus dados antes de enviar. Você pode voltar e editar qualquer etapa.</p>

                  <ResumoSecao titulo="Dados pessoais" etapa={1} onEditar={irParaEtapa}>
                    <ResumoLinha label="Nome" valor={valores.nome_completo} />
                    <ResumoLinha label="CPF" valor={valores.cpf} />
                    <ResumoLinha label="E-mail" valor={valores.email} />
                    <ResumoLinha label="WhatsApp" valor={valores.telefone} />
                    <ResumoLinha label="Endereço" valor={[valores.endereco, valores.numero, valores.cidade, valores.estado].filter(Boolean).join(', ')} />
                  </ResumoSecao>

                  <ResumoSecao titulo="CNH" etapa={2} onEditar={irParaEtapa}>
                    <ResumoLinha label="Número" valor={valores.cnh_numero} />
                    <ResumoLinha label="Categoria" valor={valores.cnh_categoria} />
                    <ResumoLinha label="Validade" valor={valores.cnh_validade} />
                  </ResumoSecao>

                  <ResumoSecao titulo="Experiência em apps" etapa={3} onEditar={irParaEtapa}>
                    <ResumoLinha label="Já dirige por app" valor={SIM_NAO_LABEL[valores.ja_dirige_app ?? '']} />
                    <ResumoLinha label="Tempo de experiência" valor={TEMPO_EXPERIENCIA_OPCOES.find((o) => o.value === valores.tempo_experiencia)?.label} />
                    <ResumoLinha label="Apps" valor={valores.apps_utilizados?.join(', ')} />
                    <ResumoLinha label="Km/semana" valor={valores.km_semanal_km} />
                  </ResumoSecao>

                  <ResumoSecao titulo="Histórico de locações" etapa={4} onEditar={irParaEtapa}>
                    <ResumoLinha label="Já alugou antes" valor={SIM_NAO_LABEL[valores.ja_alugou_veiculo_antes ?? '']} />
                    <ResumoLinha label="Sem pendências" valor={SIM_NAO_LABEL[valores.locacao_anterior_sem_pendencias ?? '']} />
                  </ResumoSecao>

                  <ResumoSecao titulo="Capacidade financeira" etapa={5} onEditar={irParaEtapa}>
                    <ResumoLinha label="Renda mensal" valor={valores.renda_mensal_declarada ? `R$ ${valores.renda_mensal_declarada}` : undefined} />
                    <ResumoLinha label="Outra fonte de renda" valor={SIM_NAO_LABEL[valores.possui_outra_fonte_renda ?? '']} />
                    <ResumoLinha label="Conta bancária" valor={SIM_NAO_LABEL[valores.possui_conta_bancaria ?? '']} />
                  </ResumoSecao>

                  <ResumoSecao titulo="Perfil operacional" etapa={6} onEditar={irParaEtapa}>
                    <ResumoLinha label="Disponibilidade" valor={DISPONIBILIDADE_OPCOES.find((o) => o.value === valores.disponibilidade_horas)?.label} />
                    <ResumoLinha label="Quando pretende começar" valor={valores.quando_pretende_comecar} />
                  </ResumoSecao>

                  <ResumoSecao titulo="Referências" etapa={7} onEditar={irParaEtapa}>
                    <ResumoLinha label="Referência" valor={[valores.referencia_nome, valores.referencia_telefone].filter(Boolean).join(' — ')} />
                    <ResumoLinha
                      label="Contato de emergência"
                      valor={[valores.contato_emergencia_nome, valores.contato_emergencia_telefone].filter(Boolean).join(' — ')}
                    />
                  </ResumoSecao>

                  <ResumoSecao titulo="Documentos" etapa={8} onEditar={irParaEtapa}>
                    {DOCUMENTOS_OBRIGATORIOS.map((d) => (
                      <ResumoLinha key={d.categoria} label={d.label} valor={docs[d.categoria] ? docs[d.categoria]!.name : 'Não anexado'} />
                    ))}
                    <ResumoLinha label="Aceitou a Política de Privacidade" valor={valores.aceitou_politica_privacidade ? 'Sim' : 'Não'} />
                  </ResumoSecao>
                </section>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-6">
                {etapaAtual > 1 ? (
                  <Button type="button" variant="secondary" onClick={voltar} className="h-11">
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </Button>
                ) : (
                  <span />
                )}

                {etapaAtual < TOTAL_ETAPAS ? (
                  <Button type="button" onClick={avancar} className="h-11 bg-[#2389FF] font-bold text-white hover:bg-[#1B6FDB]">
                    Avançar
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={enviando}
                    className="h-12 rounded-xl bg-[#2389FF] px-6 text-base font-bold text-white hover:bg-[#1B6FDB] focus-visible:ring-[#2389FF] focus-visible:ring-offset-0"
                  >
                    {enviando ? 'Enviando…' : (
                      <>
                        Enviar cadastro para análise <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>

              {etapaAtual === TOTAL_ETAPAS && (
                <>
                  <p className="flex items-center justify-center gap-1.5 text-center text-xs text-neutral-500">
                    <Mail className="h-3.5 w-3.5" />
                    Nossa equipe entrará em contato pelos dados informados.
                  </p>
                  <p className="text-center text-sm text-neutral-500">
                    Já sou motorista aprovado e estou rodando.{' '}
                    <Link to="/login" className="font-medium text-[#2389FF] hover:underline">
                      Entrar no app
                    </Link>
                  </p>
                </>
              )}
            </form>
          </div>
        </div>
      </main>

      <footer className="border-t border-neutral-200 bg-white px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src={rodavoltLogo} alt="RodaVolt" className="h-5 w-auto" />
            <span className="text-xs text-neutral-400">Mobilidade que transforma.</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <Link to="/politica-privacidade" className="hover:text-neutral-800">
              Política de Privacidade
            </Link>
            <Link to="/" className="hover:text-neutral-800">
              Voltar ao site
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
