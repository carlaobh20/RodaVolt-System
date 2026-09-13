import { useState } from 'react';
import { Dialog } from '@/shared/components/ui/dialog';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { toast, extrairMensagemDeErro } from '@/shared/components/ui/toast';
import { useRegistrarDecisao } from '../../hooks/useRodaScore';
import type { MotoristaDecisaoTipo } from '../../api/rodaScore';

const TIPO_DECISAO_LABEL: Record<MotoristaDecisaoTipo, string> = {
  aprovar: 'Aprovar',
  reprovar: 'Reprovar',
  solicitar_mais_informacao: 'Solicitar mais informação',
  manter_em_analise: 'Manter em análise',
};

// Toda decisão sobre o candidato passa por aqui — nunca automática, nunca sem justificativa
// (a RPC `registrar_decisao_motorista` recusa string vazia, e recusa "aprovar" se existir flag
// crítica em aberto — essa trava é no banco, não só nesta tela). O objetivo desta tela é só dar
// a interface; a regra de negócio inteira já está protegida no servidor (migration 0054).
export function RegistrarDecisaoDialog({
  open,
  onOpenChange,
  motoristaId,
  temFlagCriticaAberta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motoristaId: string;
  temFlagCriticaAberta: boolean;
}) {
  const [tipo, setTipo] = useState<MotoristaDecisaoTipo>('manter_em_analise');
  const [justificativa, setJustificativa] = useState('');
  const registrar = useRegistrarDecisao(motoristaId);

  function handleClose(next: boolean) {
    if (!next) {
      setTipo('manter_em_analise');
      setJustificativa('');
    }
    onOpenChange(next);
  }

  function handleSubmit() {
    if (!justificativa.trim()) return;
    registrar.mutate(
      { tipoDecisao: tipo, justificativa: justificativa.trim() },
      {
        onSuccess: () => {
          toast.success('Decisão registrada');
          handleClose(false);
        },
        onError: (err) => {
          toast.error('Não foi possível registrar a decisão', extrairMensagemDeErro(err));
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose} title="Registrar decisão" description="Fica salvo com seu usuário, data e justificativa — não pode ser apagado depois.">
      <div className="space-y-4">
        <div>
          <Label>Decisão</Label>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as MotoristaDecisaoTipo)}>
            {Object.entries(TIPO_DECISAO_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {tipo === 'aprovar' && temFlagCriticaAberta && (
            <p className="mt-1.5 text-xs text-red-600">
              Existe flag crítica em aberto para este candidato — o servidor vai recusar esta aprovação até ela ser resolvida.
            </p>
          )}
        </div>
        <div>
          <Label>Justificativa (obrigatória)</Label>
          <Textarea rows={4} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Por que essa decisão…" />
        </div>
        {registrar.isError && <p className="text-xs text-red-600">Erro: {extrairMensagemDeErro(registrar.error)}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={registrar.isPending || !justificativa.trim()}>
            {registrar.isPending ? 'Registrando…' : 'Registrar decisão'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
