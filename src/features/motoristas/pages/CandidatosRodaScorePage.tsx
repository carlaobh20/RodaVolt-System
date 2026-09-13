import { useState } from 'react';
import { AlertCircle, Search, ShieldAlert } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Select } from '@/shared/components/ui/select';
import { useCandidatosRodaScore } from '../hooks/useRodaScore';
import { MotoristaCrmDrawer } from '../components/crm/MotoristaCrmDrawer';
import type { CandidatoRodaScore, RodaScoreFaixa } from '../api/rodaScore';

// Épico 6 — RodaScore v1.0 (migration 0054). Painel pedido explicitamente pelo Carlos:
// "Crie um painel admin RodaVolt candidatos com filtros e cards" — distinto do Kanban de CRM
// (que organiza por ETAPA do funil), este organiza por RESULTADO DO SCORE: é a tela pra
// responder "quem eu devo olhar primeiro", não "em que fase cada um está".
//
// [Decisão minha, registrada por escrito — Carlos pode ratificar ou pedir diferente]: virou uma
// 3ª aba dentro de /motoristas (mesmo padrão já usado por CRM/Todos em MotoristasPage.tsx), não
// uma rota nova nem um item de menu novo. Reuso do MotoristaCrmDrawer pra abrir o candidato (a
// aba RodaScore já existe lá) em vez de duplicar a tela de detalhe. Risco dessa escolha: se o
// número de candidatos crescer muito (milhares), a busca/filtro 100% client-side implementada
// aqui (ver listCandidatosRodaScore, api/rodaScore.ts) começa a pesar — trivial de mover pro
// servidor depois, não é uma decisão que tranca porta.
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

type FiltroFaixa = RodaScoreFaixa | 'pendente_entrevista' | 'todos';

function CandidatoCard({ candidato, onClick }: { candidato: CandidatoRodaScore; onClick: () => void }) {
  const r = candidato.rodascore_resultado;
  const flagsAbertas = candidato.rodascore_flags.filter((f) => !f.resolvida);
  const criticasAbertas = flagsAbertas.filter((f) => f.severidade === 'critica').length;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{candidato.nome_completo}</p>
          <p className="truncate text-xs text-neutral-500">{candidato.telefone ?? candidato.email ?? 'Sem contato'}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold leading-none text-neutral-900 dark:text-neutral-100">{r.total}</p>
          <p className="text-[10px] text-neutral-400">/ {r.entrevista_pendente ? '90' : '100'}</p>
        </div>
      </div>

      <div>
        {r.entrevista_pendente ? (
          <Badge variant="secondary">Aguardando entrevista</Badge>
        ) : (
          r.faixa && <Badge variant={FAIXA_VARIANT[r.faixa]}>{FAIXA_LABEL[r.faixa]}</Badge>
        )}
      </div>

      {flagsAbertas.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <ShieldAlert className={criticasAbertas > 0 ? 'h-3.5 w-3.5 shrink-0 text-red-600' : 'h-3.5 w-3.5 shrink-0 text-amber-600'} />
          <span className={criticasAbertas > 0 ? 'text-red-600' : 'text-amber-600'}>
            {criticasAbertas > 0
              ? `${criticasAbertas} flag(s) crítica(s) em aberto`
              : `${flagsAbertas.length} flag(s) de atenção em aberto`}
          </span>
        </div>
      )}

      <p className="mt-1 text-[11px] text-neutral-400">{candidato.cidade ?? 'Cidade não informada'}</p>
    </button>
  );
}

export function CandidatosRodaScorePage() {
  const { data: candidatos, isLoading, isError } = useCandidatosRodaScore();
  const [busca, setBusca] = useState('');
  const [faixa, setFaixa] = useState<FiltroFaixa>('todos');
  const [soComCritica, setSoComCritica] = useState(false);
  const [motoristaAbertoId, setMotoristaAbertoId] = useState<string | null>(null);

  const lista = (candidatos ?? []).filter((c) => {
    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      if (!c.nome_completo.toLowerCase().includes(termo) && !(c.telefone ?? '').includes(termo)) return false;
    }
    if (faixa === 'pendente_entrevista' && !c.rodascore_resultado.entrevista_pendente) return false;
    if (faixa !== 'todos' && faixa !== 'pendente_entrevista' && c.rodascore_resultado.faixa !== faixa) return false;
    if (soComCritica) {
      const temCritica = c.rodascore_flags.some((f) => !f.resolvida && f.severidade === 'critica');
      if (!temCritica) return false;
    }
    return true;
  });

  return (
    <div>
      <p className="text-sm text-neutral-500">
        Todo candidato que já passou pelo cadastro público e teve o RodaScore calculado. Clique num cartão para ver o detalhe completo,
        registrar entrevista ou decisão.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone…" className="pl-9" />
        </div>
        <Select value={faixa} onChange={(e) => setFaixa(e.target.value as FiltroFaixa)} className="max-w-xs">
          <option value="todos">Todas as faixas</option>
          <option value="pendente_entrevista">Aguardando entrevista</option>
          <option value="forte">Forte</option>
          <option value="analise">Em análise</option>
          <option value="alto_risco">Alto risco</option>
          <option value="nao_priorizar">Não priorizar</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          <input
            type="checkbox"
            checked={soComCritica}
            onChange={(e) => setSoComCritica(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 accent-red-600"
          />
          Só com flag crítica em aberto
        </label>
      </div>

      {isLoading && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 cockpit-shimmer rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Erro ao carregar candidatos.
        </div>
      )}

      {!isLoading && !isError && lista.length === 0 && (
        <p className="mt-6 py-6 text-center text-sm text-neutral-500">
          {(candidatos ?? []).length === 0
            ? 'Nenhum candidato com RodaScore calculado ainda — assim que alguém preencher o cadastro público, aparece aqui.'
            : 'Nenhum candidato encontrado com esses filtros.'}
        </p>
      )}

      {!isLoading && lista.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => (
            <CandidatoCard key={c.id} candidato={c} onClick={() => setMotoristaAbertoId(c.id)} />
          ))}
        </div>
      )}

      <MotoristaCrmDrawer motoristaId={motoristaAbertoId} onOpenChange={(open) => !open && setMotoristaAbertoId(null)} />
    </div>
  );
}
