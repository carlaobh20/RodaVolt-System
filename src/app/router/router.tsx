import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/app/layout/AppLayout';
import { AppLayoutMotorista } from '@/features/motorista-app/components/AppLayoutMotorista';
import { NaoEncontradoPage } from './NaoEncontradoPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RequireOwner } from './RequireOwner';
import { RequireStaff } from './RequireStaff';
import { RequireMotorista } from './RequireMotorista';

// Code-splitting (Fase 2, achado nº1 da auditoria pra mobile): antes tudo era import estático
// e o bundle era um único arquivo de ~1,7 MB — o motorista baixava o ERP inteiro (Recharts,
// dnd-kit, simulador financeiro) só pra ver o próprio contrato. Agora cada PÁGINA é um chunk
// lazy: o ramo /motorista e o ramo administrativo viram bundles separados, e cada role só
// baixa o seu. Os guards, layouts e a tela 404 ficam eager (são leves e sempre necessários).
// Suspense fica dentro de cada layout, em volta do <Outlet/> (ver AppLayout / AppLayoutMotorista).
const named = <T extends Record<string, unknown>>(factory: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await factory())[name] as React.ComponentType<unknown> }));

// --- públicas / auth ---
const LoginPage = named(() => import('@/features/auth/pages/LoginPage'), 'LoginPage');
const AceitarConvitePage = named(() => import('@/features/auth/pages/AceitarConvitePage'), 'AceitarConvitePage');
const RecuperarSenhaPage = named(() => import('@/features/auth/pages/RecuperarSenhaPage'), 'RecuperarSenhaPage');
const RedefinirSenhaPage = named(() => import('@/features/auth/pages/RedefinirSenhaPage'), 'RedefinirSenhaPage');
// Funil público de cadastro de lead (migration 0053) — quem clica em "Quero alugar" na
// landing cai aqui, sem login (ainda não é cliente).
const CadastroLeadPage = named(() => import('@/features/lead-publico/pages/CadastroLeadPage'), 'CadastroLeadPage');
const PoliticaPrivacidadePage = named(() => import('@/features/lead-publico/pages/PoliticaPrivacidadePage'), 'PoliticaPrivacidadePage');

// --- portal do motorista ---
const MotoristaHomePage = named(() => import('@/features/motorista-app/pages/MotoristaHomePage'), 'MotoristaHomePage');
const MeuCarroPage = named(() => import('@/features/motorista-app/pages/MeuCarroPage'), 'MeuCarroPage');
const MeuContratoPage = named(() => import('@/features/motorista-app/pages/MeuContratoPage'), 'MeuContratoPage');
const MeusPagamentosPage = named(() => import('@/features/motorista-app/pages/MeusPagamentosPage'), 'MeusPagamentosPage');
const CobrancaDetalhePage = named(() => import('@/features/motorista-app/pages/CobrancaDetalhePage'), 'CobrancaDetalhePage');
const LojinhaPage = named(() => import('@/features/motorista-app/pages/LojinhaPage'), 'LojinhaPage');
const CarrinhoPage = named(() => import('@/features/motorista-app/pages/CarrinhoPage'), 'CarrinhoPage');
const MeusPedidosPage = named(() => import('@/features/motorista-app/pages/MeusPedidosPage'), 'MeusPedidosPage');
const MeusDocumentosPage = named(() => import('@/features/motorista-app/pages/MeusDocumentosPage'), 'MeusDocumentosPage');
const MinhasVistoriasPage = named(() => import('@/features/motorista-app/pages/MinhasVistoriasPage'), 'MinhasVistoriasPage');
const VistoriaDetalhePage = named(() => import('@/features/motorista-app/pages/VistoriaDetalhePage'), 'VistoriaDetalhePage');
const SuportePage = named(() => import('@/features/motorista-app/pages/SuportePage'), 'SuportePage');
const AnexarChamadoPage = named(() => import('@/features/motorista-app/pages/AnexarChamadoPage'), 'AnexarChamadoPage');
const NovaVistoriaPage = named(() => import('@/features/motorista-app/pages/NovaVistoriaPage'), 'NovaVistoriaPage');
const NotificacoesPage = named(() => import('@/features/motorista-app/pages/NotificacoesPage'), 'NotificacoesPage');
const PerfilPage = named(() => import('@/features/motorista-app/pages/PerfilPage'), 'PerfilPage');
const MaisPage = named(() => import('@/features/motorista-app/pages/MaisPage'), 'MaisPage');
const MinhaMetaPage = named(() => import('@/features/motorista-app/pages/MinhaMetaPage'), 'MinhaMetaPage');
const CentroControlePage = named(() => import('@/features/motorista-app/components/meta/CentroControlePage'), 'CentroControlePage');

// --- lojinha administrativa (staff) ---
const ProdutosPage = named(() => import('@/features/lojinha/pages/ProdutosPage'), 'ProdutosPage');
const EstoquePage = named(() => import('@/features/lojinha/pages/EstoquePage'), 'EstoquePage');
const PedidosAdminPage = named(() => import('@/features/lojinha/pages/PedidosAdminPage'), 'PedidosAdminPage');

// --- administrativo ---
const CentroDeOperacoesPage = named(() => import('@/features/command-center/pages/CentroDeOperacoesPage'), 'CentroDeOperacoesPage');
const DashboardPage = named(() => import('@/features/dashboard/pages/DashboardPage'), 'DashboardPage');
const FrotaPage = named(() => import('@/features/frota/pages/FrotaPage'), 'FrotaPage');
const VeiculoDetailPage = named(() => import('@/features/frota/pages/VeiculoDetailPage'), 'VeiculoDetailPage');
const VeiculoCreatePage = named(() => import('@/features/frota/pages/VeiculoCreatePage'), 'VeiculoCreatePage');
const VeiculoEditPage = named(() => import('@/features/frota/pages/VeiculoEditPage'), 'VeiculoEditPage');
const MotoristasPage = named(() => import('@/features/motoristas/pages/MotoristasPage'), 'MotoristasPage');
const MotoristaDetailPage = named(() => import('@/features/motoristas/pages/MotoristaDetailPage'), 'MotoristaDetailPage');
const MotoristaCreatePage = named(() => import('@/features/motoristas/pages/MotoristaCreatePage'), 'MotoristaCreatePage');
const MotoristaEditPage = named(() => import('@/features/motoristas/pages/MotoristaEditPage'), 'MotoristaEditPage');
const ContratosListPage = named(() => import('@/features/contracts/pages/ContratosListPage'), 'ContratosListPage');
// Centro Jurídico (Fase 2) — chunks próprios; o ramo /motorista nunca os baixa.
const JuridicoDashboardPage = named(() => import('@/features/contracts/juridico/pages/JuridicoDashboardPage'), 'JuridicoDashboardPage');
const JuridicoContratosPage = named(() => import('@/features/contracts/juridico/pages/JuridicoContratosPage'), 'JuridicoContratosPage');
const NovoContratoJuridicoPage = named(() => import('@/features/contracts/juridico/pages/NovoContratoJuridicoPage'), 'NovoContratoJuridicoPage');
const JuridicoContratoDetailPage = named(() => import('@/features/contracts/juridico/pages/JuridicoContratoDetailPage'), 'JuridicoContratoDetailPage');
const JuridicoTemplatesPage = named(() => import('@/features/contracts/juridico/pages/JuridicoTemplatesPage'), 'JuridicoTemplatesPage');
const JuridicoPoliticasPage = named(() => import('@/features/contracts/juridico/pages/JuridicoPoliticasPage'), 'JuridicoPoliticasPage');
const JuridicoParametrosPage = named(() => import('@/features/contracts/juridico/pages/JuridicoParametrosPage'), 'JuridicoParametrosPage');
const JuridicoSalaAdvogadoPage = named(() => import('@/features/contracts/juridico/pages/JuridicoSalaAdvogadoPage'), 'JuridicoSalaAdvogadoPage');
const JuridicoPacoteAdvogadoPage = named(() => import('@/features/contracts/juridico/pages/JuridicoPacoteAdvogadoPage'), 'JuridicoPacoteAdvogadoPage');
const JuridicoRetornosPage = named(() => import('@/features/contracts/juridico/pages/JuridicoRetornosPage'), 'JuridicoRetornosPage');
const ContratoDetailPage = named(() => import('@/features/contracts/pages/ContratoDetailPage'), 'ContratoDetailPage');
const ContratoCreatePage = named(() => import('@/features/contracts/pages/ContratoCreatePage'), 'ContratoCreatePage');
const ContratoEditPage = named(() => import('@/features/contracts/pages/ContratoEditPage'), 'ContratoEditPage');
const LancamentosListPage = named(() => import('@/features/financeiro/pages/LancamentosListPage'), 'LancamentosListPage');
const PagamentosPage = named(() => import('@/features/financeiro/pages/PagamentosPage'), 'PagamentosPage');
const ContasBancariasPage = named(() => import('@/features/financeiro/pages/ContasBancariasPage'), 'ContasBancariasPage');
const CentrosCustoPage = named(() => import('@/features/financeiro/pages/CentrosCustoPage'), 'CentrosCustoPage');
const AcoesListPage = named(() => import('@/features/operacoes/pages/AcoesListPage'), 'AcoesListPage');
const CentralAtendimentoPage = named(() => import('@/features/atendimento/pages/CentralAtendimentoPage'), 'CentralAtendimentoPage');
const CentroDeEstrategiaPage = named(() => import('@/features/estrategia/pages/CentroDeEstrategiaPage'), 'CentroDeEstrategiaPage');
const UsuariosPage = named(() => import('@/features/auth/pages/UsuariosPage'), 'UsuariosPage');

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Alias por pedido do Carlos: /admin abre a mesma tela de /login (a tela já é
  // compartilhada staff+motorista — ver comentário em LoginPage.tsx). Não existe
  // "login de admin" separado: depois de autenticar, RequireStaff/RequireOwner
  // já decidem o que essa conta pode ver. Isso é só um endereço mais fácil de
  // lembrar/divulgar pra quem administra a empresa.
  { path: '/admin', element: <LoginPage /> },
  { path: '/quero-alugar', element: <CadastroLeadPage /> },
  { path: '/politica-privacidade', element: <PoliticaPrivacidadePage /> },
  { path: '/aceitar-convite', element: <AceitarConvitePage /> },
  { path: '/recuperar-senha', element: <RecuperarSenhaPage /> },
  // Pública de propósito: o link do e-mail de recuperação autentica sozinho (supabase-js
  // processa o token da URL); a própria página nega quando não há sessão.
  { path: '/redefinir-senha', element: <RedefinirSenhaPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/motorista',
        element: <RequireMotorista />,
        children: [
          {
            element: <AppLayoutMotorista />,
            children: [
              { index: true, element: <MotoristaHomePage /> },
              { path: 'carro', element: <MeuCarroPage /> },
              { path: 'centro-controle', element: <CentroControlePage /> },
              { path: 'meta', element: <MinhaMetaPage /> },
              { path: 'contrato', element: <MeuContratoPage /> },
              { path: 'pagamentos', element: <MeusPagamentosPage /> },
              { path: 'pagamentos/:id', element: <CobrancaDetalhePage /> },
              { path: 'lojinha', element: <LojinhaPage /> },
              { path: 'lojinha/carrinho', element: <CarrinhoPage /> },
              { path: 'lojinha/pedidos', element: <MeusPedidosPage /> },
              { path: 'documentos', element: <MeusDocumentosPage /> },
              { path: 'vistorias', element: <MinhasVistoriasPage /> },
              { path: 'vistorias/nova', element: <NovaVistoriaPage /> },
              { path: 'vistorias/:id', element: <VistoriaDetalhePage /> },
              { path: 'suporte', element: <SuportePage /> },
              { path: 'suporte/:id/anexar', element: <AnexarChamadoPage /> },
              { path: 'notificacoes', element: <NotificacoesPage /> },
              { path: 'perfil', element: <PerfilPage /> },
              { path: 'mais', element: <MaisPage /> },
            ],
          },
        ],
      },
      {
        path: '/',
        element: <RequireStaff />,
        children: [
          {
            path: '/',
            element: <AppLayout />,
            children: [
              { index: true, element: <CentroDeOperacoesPage /> },
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'veiculos', element: <FrotaPage /> },
              { path: 'veiculos/novo', element: <VeiculoCreatePage /> },
              { path: 'veiculos/:id', element: <VeiculoDetailPage /> },
              { path: 'veiculos/:id/editar', element: <VeiculoEditPage /> },
              { path: 'motoristas', element: <MotoristasPage /> },
              { path: 'motoristas/novo', element: <MotoristaCreatePage /> },
              { path: 'motoristas/:id', element: <MotoristaDetailPage /> },
              { path: 'motoristas/:id/editar', element: <MotoristaEditPage /> },
              { path: 'contratos', element: <ContratosListPage /> },
              { path: 'contratos/novo', element: <ContratoCreatePage /> },
              { path: 'contratos/:id', element: <ContratoDetailPage /> },
              { path: 'contratos/:id/editar', element: <ContratoEditPage /> },
              { path: 'juridico', element: <JuridicoDashboardPage /> },
              { path: 'juridico/contratos', element: <JuridicoContratosPage /> },
              { path: 'juridico/contratos/novo', element: <NovoContratoJuridicoPage /> },
              { path: 'juridico/contratos/:id', element: <JuridicoContratoDetailPage /> },
              { path: 'juridico/templates', element: <JuridicoTemplatesPage /> },
              { path: 'juridico/politicas', element: <JuridicoPoliticasPage /> },
              { path: 'juridico/parametros', element: <JuridicoParametrosPage /> },
              { path: 'juridico/sala-do-advogado', element: <JuridicoSalaAdvogadoPage /> },
              { path: 'juridico/pacote-advogado', element: <JuridicoPacoteAdvogadoPage /> },
              { path: 'juridico/retornos', element: <JuridicoRetornosPage /> },
              { path: 'financeiro/lancamentos', element: <LancamentosListPage /> },
              { path: 'financeiro/pagamentos', element: <PagamentosPage /> },
              { path: 'financeiro/contas-bancarias', element: <ContasBancariasPage /> },
              { path: 'financeiro/centros-custo', element: <CentrosCustoPage /> },
              { path: 'operacoes/acoes', element: <AcoesListPage /> },
              { path: 'atendimento', element: <CentralAtendimentoPage /> },
              { path: 'lojinha/produtos', element: <ProdutosPage /> },
              { path: 'lojinha/estoque', element: <EstoquePage /> },
              { path: 'lojinha/pedidos', element: <PedidosAdminPage /> },
              {
                path: 'estrategia',
                element: <RequireOwner />,
                children: [{ index: true, element: <CentroDeEstrategiaPage /> }],
              },
              { path: 'usuarios', element: <UsuariosPage /> },
            ],
          },
        ],
      },
    ],
  },
  // 404 — qualquer rota desconhecida (achado da auditoria: antes renderizava tela em branco).
  { path: '*', element: <NaoEncontradoPage /> },
]);
