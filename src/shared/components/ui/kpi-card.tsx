import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { SeloOrigemDado, type OrigemDado } from './selo-dado';

// Card de KPI do Cockpit — morava em features/frota/ (regra dos 3, DEC-008): "não generalizar
// pra shared/ até um segundo módulo precisar do mesmo padrão". Motoristas (Sprint 6) é esse
// segundo módulo — hoisted aqui, mesmo padrão do resto da Sprint 4/5/6 (ver DEC-025).
export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  pending,
  origem,
  to,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  /** true = KPI ainda sem módulo de negócio por trás (Financeiro/Manutenção/Contratos) — mostrado como "Em breve". */
  pending?: boolean;
  /** Épico 9, Fase 2.1 Parte 3 — só preencher quando ESTE KPI específico precisa de um selo
   * diferente do que a seção ao redor já declara (ex.: um número "potencial"/estimado dentro de
   * uma seção que, no geral, é toda DADO REAL). Não preencher em todo KPI — isso viraria ruído; a
   * maioria já está coberta pelo selo da seção/Card em volta. */
  origem?: OrigemDado;
  /** Quando o KPI representa um subconjunto EXATO e identificável de itens (ex.: "Total de
   * veículos" → todos; um card "por status" → só aquele status), `to` linka pra lista já
   * filtrada — mesmo padrão de `href` usado pelas filas do Centro de Operações
   * (QueueCard.tsx). Não preencher em KPIs agregados (média, soma, percentual combinando mais
   * de um status) — o clique implicaria um filtro que não existe de fato. */
  to?: string;
}) {
  const classeCard = cn(
    'flex min-w-[168px] flex-1 flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]',
    pending && 'opacity-70',
    to && !pending && 'cursor-pointer hover:border-brand-300 dark:hover:border-brand-800'
  );

  const conteudo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-neutral-500">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        </div>
        {origem && !pending && <SeloOrigemDado origem={origem} />}
      </div>
      {pending ? (
        <span className="text-xs font-medium text-neutral-400">Em breve</span>
      ) : (
        <span className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</span>
      )}
      {hint && !pending && <span className="text-[11px] text-neutral-400">{hint}</span>}
    </>
  );

  if (to && !pending) {
    return (
      <Link to={to} className={classeCard}>
        {conteudo}
      </Link>
    );
  }

  return <div className={classeCard}>{conteudo}</div>;
}
