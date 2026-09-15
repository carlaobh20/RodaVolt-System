import { useEffect, useState } from 'react';
import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, Car, ClipboardList, Compass, FileSignature, Landmark, PieChart, Radar, Headset, LogOut, Receipt, Scale, Search, Users, UserCog, Wallet, ShoppingBag, Package, PackageOpen } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { supabase } from '@/shared/lib/supabase';
import { useCurrentUsuario } from '@/shared/hooks/useCurrentUsuario';
import { GlobalSearchPalette } from '@/features/search/components/GlobalSearchPalette';

// Central de Comando foi a Home da Sprint 5 até o Épico 1 (Operação Perfeita, DEC-024 ainda
// válida pro resto) — renomeada pra Centro de Operações porque a página deixou de ser só
// leitura (Alertas/Riscos/Oportunidades) e passou a ser a fila de trabalho principal (12
// filas clicáveis, ver CentroDeOperacoesPage.tsx) — "Central de Comando" media bem uma tela
// de monitoramento, não uma tela onde se trabalha o dia inteiro. "Contratos" entra na Sprint 7,
// entre Motoristas e Dashboard — segue a ordem do funil (Veículo → Motorista → Contrato) em
// vez de ordem alfabética. Financeiro (Sprint 8) entra em 3 itens planos, não 1 só — não
// existe um "Cockpit Financeiro" único a linkar (DEC-052), então a navegação reflete isso com
// honestidade em vez de forçar uma rota-índice artificial. Ações Operacionais (Sprint 9)
// segue o mesmo raciocínio (DEC-054/055) — é fila de trabalho, não Cockpit.
const NAV_ITEMS = [
  { to: '/', label: 'Centro de Operações', icon: Radar, end: true },
  { to: '/veiculos', label: 'Frota', icon: Car, end: false },
  { to: '/motoristas', label: 'Motoristas', icon: Users, end: false },
  { to: '/contratos', label: 'Contratos', icon: FileSignature, end: false },
  // Centro Jurídico (Fase 2) — logo após Contratos: é a visão DOCUMENTAL do mesmo objeto
  // (documento/versões/assinaturas), enquanto /contratos segue sendo a visão financeira/operacional.
  { to: '/juridico', label: 'Jurídico', icon: Scale, end: false },
  { to: '/operacoes/acoes', label: 'Ações Operacionais', icon: ClipboardList, end: false },
  { to: '/atendimento', label: 'Atendimento Motorista', icon: Headset, end: false },
  // Épico 12 — Lojinha administrativa (Fase 3). Pedidos primeiro (fila de trabalho diária),
  // depois catálogo e estoque (cadastro/reposição).
  { to: '/lojinha/pedidos', label: 'Pedidos (Lojinha)', icon: ShoppingBag, end: false },
  { to: '/lojinha/produtos', label: 'Produtos', icon: Package, end: false },
  { to: '/lojinha/estoque', label: 'Estoque', icon: PackageOpen, end: false },
  { to: '/financeiro/lancamentos', label: 'Lançamentos', icon: Wallet, end: false },
  { to: '/financeiro/pagamentos', label: 'Pagamentos', icon: Receipt, end: false },
  { to: '/financeiro/contas-bancarias', label: 'Contas Bancárias', icon: Landmark, end: false },
  { to: '/financeiro/centros-custo', label: 'Centros de Custo', icon: PieChart, end: false },
  // Épico 2 — só aparece pra quem o RequireOwner (router.tsx) deixaria entrar mesmo (ver
  // `ownerOnly` abaixo). Não é a barreira de segurança em si (isso é o RequireOwner /
  // useCurrentUsuario) — é só não anunciar no menu uma porta que a pessoa não pode abrir.
  { to: '/estrategia', label: 'Centro de Estratégia', icon: Compass, end: true, ownerOnly: true },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/usuarios', label: 'Usuários', icon: UserCog, end: true },
];

// Movido de shared/components/layout/ para app/layout/ na Missão 5 (Fase 3, Busca Global) —
// AppLayout é a casca autenticada única, montada direto pelo router (não um componente de UI
// reutilizável por várias features), e agora precisa compor a Busca Global, que agrega dado de
// 3 features (Veículos/Motoristas/Contratos). `shared/` nunca importa de `features/` (só o
// inverso) em nenhum outro lugar do repo — mover este arquivo para `app/`, a mesma camada de
// composição que já importa toda página de toda feature em `router.tsx`, evita abrir uma
// exceção nova à regra de ouro (DEC-008) só para este componente.
export function AppLayout() {
  const { data: usuario } = useCurrentUsuario();
  const [buscaAberta, setBuscaAberta] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscaAberta(true);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <aside className="flex w-60 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="px-4 py-5">
          <span className="text-lg font-semibold text-brand-600 dark:text-brand-400">RodaVolt</span>
        </div>

        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => setBuscaAberta(true)}
            className="flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <Search className="h-3.5 w-3.5" />
            Buscar…
            <kbd className="ml-auto rounded border border-neutral-200 px-1 text-[10px] dark:border-white/10">Ctrl K</kbd>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-2">
          {NAV_ITEMS.filter(
            (item) => !item.ownerOnly || usuario?.role === 'owner' || usuario?.role === 'super_admin'
          ).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <p className="truncate text-xs text-neutral-500">{usuario?.nome_completo || usuario?.email}</p>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-2 flex items-center gap-2 text-xs text-neutral-500 hover:text-red-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* min-w-0 é essencial aqui: sem ele, um item de flex row (este <main>, ao lado do
          <aside>) usa min-width:auto por padrão, e qualquer conteúdo interno com rolagem
          horizontal própria (overflow-x-auto — Kanban do CRM, Épico 6) força esse item a
          crescer pra caber tudo em vez de rolar, esticando a página inteira. Achado ao
          verificar a Fase 1 do Kanban em produção — corrigido na raiz (aqui) em vez de em cada
          componente que algum dia tiver uma faixa de rolagem própria. */}
      <main className="min-w-0 flex-1">
        <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Carregando…</div>}>
          <Outlet />
        </Suspense>
      </main>

      {/* Achado da Fase 9 (auditoria geral): antes ficava sempre montada, então
          useGlobalSearch buscava Veículos/Motoristas/Contratos inteiros em toda página
          autenticada, mesmo sem o usuário nunca abrir a busca — exatamente o anti-padrão que
          a Fase 1 (DEC-108) corrigiu em outro lugar. Montagem condicional evita o fetch até o
          primeiro Ctrl/Cmd+K real. */}
      {buscaAberta && <GlobalSearchPalette open onOpenChange={setBuscaAberta} />}
    </div>
  );
}
