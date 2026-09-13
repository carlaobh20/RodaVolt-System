import { useState } from 'react';
import { MessageCirclePlus, Trash2 } from 'lucide-react';
import { Drawer } from '@/shared/components/ui/drawer';
import { Tabs } from '@/shared/components/ui/tabs';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { toast } from '@/shared/components/ui/toast';
import { TimelinePanel } from '@/shared/capabilities/components/TimelinePanel';
import { diasDesde } from '@/shared/lib/format';
import { useCurrentUsuario } from '@/shared/hooks/useCurrentUsuario';
import { useDeleteMotorista, useMotorista } from '../../hooks/useMotoristas';
import { useFunilEtapas } from '../../hooks/useFunilEtapas';
import { useDriverIntelligence } from '../../hooks/useDriverIntelligence';
import { diasNaEtapa } from '../../intelligence/funilMetrics';
import { ArquivosTab } from '../tabs/ArquivosTab';
import { StatusBadge } from '../StatusBadge';
import { RegistrarConversaDialog } from './RegistrarConversaDialog';
import { RodaScoreTab } from './RodaScoreTab';
import { MOTORISTA_PRIORIDADE_COLOR, MOTORISTA_PRIORIDADE_LABEL, ORIGEM_LEAD_LABEL } from '../../types';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
    </div>
  );
}

// Épico 6 — CRM, Fase 1. Aba "Resumo": só o que já é dado real e barato de calcular (score já
// existente, tempo de empresa, status/etapa/prioridade). Receita/lucro gerados, dias
// alugados/parado, multas, sinistros, avaliação, pontualidade (pedidos no brief) ficam pra
// Fase 2 — a maioria já existe em algum lugar (frota/intelligence/historicoMotoristas.ts tem
// receita/lucro por motorista, por exemplo), mas juntar tudo aqui é build novo, não é
// "básico" no sentido que a Fase 1 pediu.
//
// "Score de Retenção" aqui (driverScore.ts) é um score DIFERENTE do RodaScore (aba própria,
// migration 0054): este mede retenção de motorista já ativo; o RodaScore mede triagem de
// candidato antes da contratação. Renomeado de "Score PrimeCharge" pra não confundir os dois
// na mesma tela.
function ResumoTab({ motoristaId }: { motoristaId: string }) {
  const { data: motorista, isLoading } = useMotorista(motoristaId);
  const { data: etapas } = useFunilEtapas(motorista?.empresa_id);
  const intelligence = useDriverIntelligence(motorista);

  if (isLoading || !motorista) return <div className="h-32 cockpit-shimmer rounded-2xl" />;

  const dias = diasNaEtapa(motorista);
  const diasComoCliente = diasDesde(motorista.criado_em);
  const score = !intelligence.isLoading ? intelligence.driverScore.overall : null;
  const nomeEtapa = motorista.etapa_funil_id ? etapas?.find((e) => e.id === motorista.etapa_funil_id)?.nome : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Score de Retenção" value={score !== null ? `${score}/100` : '—'} />
        <Stat label="Tempo de empresa" value={diasComoCliente !== null ? `${diasComoCliente} dia(s)` : '—'} />
        <Stat label="Dias na etapa atual" value={dias !== null ? `${dias} dia(s)` : '—'} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={motorista.status} />
        <Badge variant="secondary">{nomeEtapa ?? 'Não classificado'}</Badge>
        <Badge variant={MOTORISTA_PRIORIDADE_COLOR[motorista.prioridade]}>{MOTORISTA_PRIORIDADE_LABEL[motorista.prioridade]}</Badge>
        {motorista.origem_lead && (
          <Badge variant="secondary">
            Origem: {ORIGEM_LEAD_LABEL[motorista.origem_lead]}
            {motorista.origem_lead_detalhe ? ` — ${motorista.origem_lead_detalhe}` : ''}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Telefone" value={motorista.telefone ?? '—'} />
        <Stat label="Cidade" value={motorista.cidade ?? '—'} />
        <Stat label="CNH válida até" value={motorista.cnh_validade ?? '—'} />
      </div>
      <p className="text-[11px] text-neutral-400">
        Receita/lucro gerados, dias alugados/parado, multas, sinistros e avaliação entram numa próxima fase — a maior parte já existe em outro
        lugar do sistema, falta só juntar aqui.
      </p>
    </div>
  );
}

export function MotoristaCrmDrawer({ motoristaId, onOpenChange }: { motoristaId: string | null; onOpenChange: (open: boolean) => void }) {
  const { data: motorista } = useMotorista(motoristaId ?? undefined);
  const { data: usuario } = useCurrentUsuario();
  const deleteMotorista = useDeleteMotorista();
  const [confirmExcluirAberto, setConfirmExcluirAberto] = useState(false);
  const [registrarConversaAberto, setRegistrarConversaAberto] = useState(false);

  function handleExcluir() {
    if (!motoristaId) return;
    deleteMotorista.mutate(motoristaId, {
      onSuccess: () => {
        toast.success('Motorista excluído');
        setConfirmExcluirAberto(false);
        onOpenChange(false);
      },
    });
  }

  return (
    <Drawer open={motoristaId !== null} onOpenChange={onOpenChange} title={motorista?.nome_completo ?? 'Motorista'} description="Jornada do motorista">
      {motoristaId && (
        <>
          {/* Exclusão reaproveita o MESMO fluxo já existente em MotoristaDetailPage (migration
              0004: pode_excluir_motorista, gated a super_admin/owner/admin; contrato vinculado
              já bloqueia via FK "on delete restrict") — só ganhou um segundo ponto de entrada,
              aqui no painel do Kanban, em vez de só na página cheia /motoristas/:id. */}
          <div className="mb-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRegistrarConversaAberto(true)}>
              <MessageCirclePlus className="h-3.5 w-3.5" />
              Registrar conversa
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setConfirmExcluirAberto(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir motorista
            </Button>
          </div>
          <Tabs
            items={[
              { value: 'resumo', label: 'Resumo', content: <ResumoTab motoristaId={motoristaId} /> },
              {
                value: 'rodascore',
                label: 'RodaScore',
                content: <RodaScoreTab motoristaId={motoristaId} empresaId={usuario?.empresa_id ?? undefined} usuarioId={usuario?.id ?? undefined} />,
              },
              { value: 'timeline', label: 'Timeline', content: <TimelinePanel entidadeTipo="motorista" entidadeId={motoristaId} /> },
              {
                value: 'documentos',
                label: 'Documentos',
                content: <ArquivosTab motoristaId={motoristaId} empresaId={usuario?.empresa_id ?? undefined} usuarioId={usuario?.id ?? undefined} />,
              },
            ]}
          />
          <ConfirmDialog
            open={confirmExcluirAberto}
            onOpenChange={setConfirmExcluirAberto}
            title="Excluir este motorista?"
            description="Esta ação não pode ser desfeita. Motoristas com contrato vinculado não podem ser excluídos."
            confirmLabel="Excluir"
            destructive
            onConfirm={handleExcluir}
            isPending={deleteMotorista.isPending}
          />
          <RegistrarConversaDialog
            open={registrarConversaAberto}
            onOpenChange={setRegistrarConversaAberto}
            empresaId={usuario?.empresa_id ?? undefined}
            entidadeId={motoristaId}
            usuarioId={usuario?.id ?? undefined}
          />
        </>
      )}
    </Drawer>
  );
}
