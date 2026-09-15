import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Car, Target, Wallet, ShoppingBag, Menu } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CarrinhoProvider, useCarrinho } from '../lib/carrinho';
import { SkeletonPortal } from './ui';
import { SinoNotificacoes } from './SinoNotificacoes';

// Shell mobile-first do App do Motorista (Fase 2). Header enxuto + <Outlet/> num container
// max-w-md + bottom navigation fixa. safe-area-inset pra não passar por baixo do notch/home
// indicator no iOS. O carrinho da Lojinha vive num provider aqui em cima pra sobreviver à
// navegação entre abas.

const ITENS = [
  { to: '/motorista', label: 'Início', icon: Home, end: true },
  { to: '/motorista/carro', label: 'Meu carro', icon: Car, end: false },
  { to: '/motorista/meta', label: 'Meta', icon: Target, end: false },
  { to: '/motorista/pagamentos', label: 'Pagamentos', icon: Wallet, end: false },
  { to: '/motorista/lojinha', label: 'Lojinha', icon: ShoppingBag, end: false },
  { to: '/motorista/mais', label: 'Mais', icon: Menu, end: false },
] as const;

function TabBar() {
  const carrinho = useCarrinho();
  const location = useLocation();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {ITENS.map((item) => {
          const Icon = item.icon;
          const ativo = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
          const mostrarBadge = item.to === '/motorista/lojinha' && carrinho.quantidadeTotal > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                ativo ? 'text-brand-600 dark:text-brand-400' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
              {mostrarBadge && (
                <span className="absolute right-1/2 top-1 translate-x-3 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold leading-4 text-white">
                  {carrinho.quantidadeTotal}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export function AppLayoutMotorista() {
  return (
    <CarrinhoProvider>
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <header
          className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/90"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="mx-auto flex h-12 max-w-md items-center px-4">
            <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">RodaVolt</span>
            <div className="ml-auto">
              <SinoNotificacoes />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-md px-4 py-4 pb-24">
          <Suspense fallback={<SkeletonPortal />}>
            <Outlet />
          </Suspense>
        </main>

        <TabBar />
      </div>
    </CarrinhoProvider>
  );
}
