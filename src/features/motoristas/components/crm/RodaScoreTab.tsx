import { useState } from 'react';
import { Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Select } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { toast, extrairMensagemDeErro } from '@/shared/components/ui/toast';
import {
  useRodaScoreResultado,
  useRodaScoreFlags,
  useMotoristaEntrevista,
  useMotoristaDecisoes,
  useRecalcularRodaScore,
  useResolverFlag,
  useCriarFlagManual,
} from '../../hooks/useRodaScore';
import type { RodaScoreFaixa, RodaScoreFlagSeveridade, RodaScoreResultado } from '../../api/rodaScore';
import { RegistrarEntrevistaDialog } from './RegistrarEntrevistaDialog';
import { RegistrarDecisaoDialog } from './RegistrarDecisaoDialog';

// Aba "RodaScore" do drawer do candidato (Épico 6, migration 0054). Só LÊ dado já calculado no
// servidor — nenhuma conta acontece aqui. As 3 ações desta tela (recalcular, registrar
// entrevista, registrar decisão) são as 3 únicas RPCs autenticadas que tocam nessas tabelas.

const FAIXA_LABEL: Record<RodaScoreFaixa, string> = {
  forte: 'Forte',
  analise: 'Em análise',
  alto_risco: 'Alto risco',
  nao_priorizar: 'Não priorizar',
};

const FAIXA_VARIANT: Record<RodaScoreFaixa, 'success' | 'info' | 'warning' | 'destructive'> = {
  forte: 'success',
  analise: 'info',
  alto_risco: 'warning',
  nao_priorizar: 'destructive',
};

const CATEGORIAS: { chave: keyof RodaScoreResultado; label: string; peso: number }[] = [
  { chave: 'score_documentacao', label: 'Documentação', peso: 10 },
  { chave: 'score_cnh', label: 'CNH', peso: 15 },
  { chave: 'score_apps', label: 'Apps', peso: 20 },
  { chave: 'score_locacoes', label: 'Locações', peso: 15 },
  { chave: 'score_financeiro', label: 'Financeiro', peso: 15 },
  { chave: 'score_operacional', label: 'Operacional', peso: 10 },
  { chave: 'score_consistencia_referencias', label: 'Consistência / Referências', peso: 5 },
];

function BarraCategoria({ label, valor, peso }: { label: string; valor: number; peso: number }) {
  const pct = peso > 0 ? Math.round((valor / peso) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {valor}/{peso}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className="h-full rounded-full bg-[#2389FF]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function RodaScoreTab({
  motoristaId,
  empresaId,
  usuarioId,
}: {
  motoristaId: string;
  empresaId: string | undefined;
  usuarioId: string | undefined;
}) {
  const { data: resultado, isLoading } = useRodaScoreResultado(motoristaId);
  const { data: flags } = useRodaScoreFlags(motoristaId);
  const { data: entrevista } = useMotoristaEntrevista(motoristaId);
  const { data: decisoes } = useMotoristaDecisoes(motoristaId);
  const recalcular = useRecalcularRodaScore(motoristaId);
  const resolverFlag = useResolverFlag(motoristaId, usuarioId);
  const criarFlag = useCriarFlagManual(motoristaId, usuarioId);

  const [entrevistaAberta, setEntrevistaAberta] = useState(false);
  const [decisaoAberta, setDecisaoAberta] = useState(false);
  const [novaFlagAberta, setNovaFlagAberta] = useState(false);
  const [novaFlagDescricao, setNovaFlagDescricao] = useState('');
  const [novaFlagSeveridade, setNovaFlagSeveridade] = useState<RodaScoreFlagSeveridade>('atencao');

  function handleCriarFlag() {
    if (!empresaId || !novaFlagDescricao.trim()) return;
    criarFlag.mutate(
      { empresaId, descricao: novaFlagDescricao.trim(), severidade: novaFlagSeveridade },
      {
        onSuccess: () => {
          toast.success('Flag registrada');
          setNovaFlagDescricao('');
          setNovaFlagSeveridade('atencao');
          setNovaFlagAberta(false);
        },
        onError: (err) => toast.error('Erro ao registrar flag', extrairMensagemDeErro(err)),
      }
    );
  }

  if (isLoading) return <div className="h-40 cockpit-shimmer rounded-2xl" />;

  if (!resultado) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-neutral-500">Este candidato ainda não tem um RodaScore calculado.</p>
        <Button
          type="button"
          size="sm"
          onClick={() => recalcular.mutate(undefined, { onError: (err) => toast.error('Erro ao calcular', extrairMensagemDeErro(err)) })}
          disabled={recalcular.isPending}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {recalcular.isPending ? 'Calculando…' : 'Calcular agora'}
        </Button>
      </div>
    );
  }

  const flagsAbertas = (flags ?? []).filter((f) => !f.resolvida);
  const flagsCriticasAbertas = flagsAbertas.filter((f) => f.severidade === 'critica');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">{resultado.total}</span>
            <span className="text-sm text-neutral-400">/ {resultado.entrevista_pendente ? '90 (parcial)' : '100'}</span>
          </div>
          {resultado.entrevista_pendente ? (
            <Badge variant="secondary" className="mt-1">
              Aguardando entrevista
            </Badge>
          ) : (
            resultado.faixa && (
              <Badge variant={FAIXA_VARIANT[resultado.faixa]} className="mt-1">
                {FAIXA_LABEL[resultado.faixa]}
              </Badge>
            )
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => recalcular.mutate(undefined, { onError: (err) => toast.error('Erro ao recalcular', extrairMensagemDeErro(err)) })}
          disabled={recalcular.isPending}
        >
          <RefreshCw className={recalcular.isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          Recalcular
        </Button>
      </div>

      {resultado.entrevista_pendente && (
        <p className="text-[11px] text-neutral-400">
          Score parcial — os {90} pontos acima não incluem Entrevista (10 pts). A faixa final (Forte/Análise/Alto
          risco/Não priorizar) só é calculada depois que a entrevista é registrada.
        </p>
      )}

      <div className="space-y-3">
        {CATEGORIAS.map((c) => (
          <BarraCategoria key={c.chave} label={c.label} valor={resultado[c.chave] as number} peso={c.peso} />
        ))}
        <BarraCategoria label="Entrevista" valor={resultado.score_entrevista ?? 0} peso={10} />
      </div>

      {flagsAbertas.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Flags em aberto</p>
          <div className="space-y-2">
            {flagsAbertas.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-800">
                <div className="flex items-start gap-2">
                  <ShieldAlert className={f.severidade === 'critica' ? 'mt-0.5 h-4 w-4 shrink-0 text-red-600' : 'mt-0.5 h-4 w-4 shrink-0 text-amber-600'} />
                  <div>
                    <Badge variant={f.severidade === 'critica' ? 'destructive' : 'warning'} className="mb-1">
                      {f.severidade === 'critica' ? 'Crítica' : 'Atenção'}
                    </Badge>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">{f.descricao}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => resolverFlag.mutate(f.id, { onError: (err) => toast.error('Erro', extrairMensagemDeErro(err)) })}
                  disabled={resolverFlag.isPending}
                >
                  Resolver
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        {!novaFlagAberta ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setNovaFlagAberta(true)} disabled={!empresaId}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar flag manual
          </Button>
        ) : (
          <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <Textarea
              rows={2}
              value={novaFlagDescricao}
              onChange={(e) => setNovaFlagDescricao(e.target.value)}
              placeholder="Descreva o que motivou a flag (ex.: divergência na entrevista, referência não confirmou vínculo)…"
            />
            <div className="flex items-center gap-2">
              <Select value={novaFlagSeveridade} onChange={(e) => setNovaFlagSeveridade(e.target.value as RodaScoreFlagSeveridade)} className="w-40">
                <option value="atencao">Atenção</option>
                <option value="critica">Crítica</option>
              </Select>
              <Button type="button" size="sm" onClick={handleCriarFlag} disabled={criarFlag.isPending || !novaFlagDescricao.trim()}>
                {criarFlag.isPending ? 'Salvando…' : 'Salvar flag'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNovaFlagAberta(false);
                  setNovaFlagDescricao('');
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEntrevistaAberta(true)}>
          {entrevista ? 'Atualizar entrevista' : 'Registrar entrevista'}
        </Button>
        <Button type="button" size="sm" onClick={() => setDecisaoAberta(true)}>
          Registrar decisão
        </Button>
      </div>

      {decisoes && decisoes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Histórico de decisões</p>
          <div className="space-y-2">
            {decisoes.map((d) => (
              <div key={d.id} className="rounded-lg border border-neutral-200 p-2.5 text-sm dark:border-neutral-800">
                <p className="font-medium text-neutral-900 dark:text-neutral-100">{d.tipo_decisao.replace(/_/g, ' ')}</p>
                <p className="text-neutral-500">{d.justificativa}</p>
                <p className="mt-1 text-[11px] text-neutral-400">{new Date(d.criado_em).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <RegistrarEntrevistaDialog open={entrevistaAberta} onOpenChange={setEntrevistaAberta} motoristaId={motoristaId} entrevistaAtual={entrevista} />
      <RegistrarDecisaoDialog
        open={decisaoAberta}
        onOpenChange={setDecisaoAberta}
        motoristaId={motoristaId}
        temFlagCriticaAberta={flagsCriticasAbertas.length > 0}
      />
    </div>
  );
}
