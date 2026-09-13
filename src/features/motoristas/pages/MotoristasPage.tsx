import { useSearchParams } from 'react-router-dom';
import { Tabs } from '@/shared/components/ui/tabs';
import { MotoristasCrmPage } from './MotoristasCrmPage';
import { MotoristasListPage } from './MotoristasListPage';
import { CandidatosRodaScorePage } from './CandidatosRodaScorePage';

// Épico 6 — CRM PrimeCharge / Jornada do Motorista, Fase 1. Mesmo padrão já usado em
// FrotaPage.tsx (Épico 4): reaproveita o componente Tabs genérico como "casca" do módulo em
// vez de inventar um submenu novo no AppLayout. Rota continua /motoristas, "CRM" vira a
// primeira aba (é a "primeira tela" pedida no brief) e a lista atual (agora "Todos os
// Motoristas") vira a segunda — nada foi substituído, só reorganizado.
//
// RodaScore v1.0 (migration 0054): "Candidatos" é a 3ª aba, mesmo raciocínio — painel próprio
// pedido pelo Carlos, sem virar rota/menu novo.
const ABAS_VALIDAS = new Set(['crm', 'todos', 'candidatos']);

export function MotoristasPage() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  // Mesmo raciocínio de FrotaPage: `?status=` (deep link do Centro de Operações) precisa cair
  // direto na lista filtrada, não no Kanban.
  const abaInicial = tabParam && ABAS_VALIDAS.has(tabParam) ? tabParam : searchParams.has('status') ? 'todos' : 'crm';

  return (
    <div className="p-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Motoristas</h1>
        <p className="mt-1 text-sm text-neutral-500">Jornada completa do motorista, do lead à fidelização.</p>
      </div>

      <div className="mt-6">
        <Tabs
          defaultValue={abaInicial}
          items={[
            { value: 'crm', label: 'CRM', content: <MotoristasCrmPage /> },
            { value: 'candidatos', label: 'Candidatos', content: <CandidatosRodaScorePage /> },
            { value: 'todos', label: 'Todos os Motoristas', content: <MotoristasListPage /> },
          ]}
        />
      </div>
    </div>
  );
}
