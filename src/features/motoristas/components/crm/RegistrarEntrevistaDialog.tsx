import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/ui/dialog';
import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/components/ui/toast';
import { useRegistrarEntrevista } from '../../hooks/useRodaScore';
import type { MotoristaEntrevista } from '../../api/rodaScore';

// RodaScore v1.0 — único sinal do score que não vem do wizard público (peso_entrevista, 10
// pontos). Nota 0-10 com uma casa decimal, observações livres (não pontuadas, só contexto pra
// quem ler depois). Salvar aqui já recalcula o RodaScore inteiro (RPC faz os dois na mesma
// transação — ver migration 0054).
export function RegistrarEntrevistaDialog({
  open,
  onOpenChange,
  motoristaId,
  entrevistaAtual,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motoristaId: string;
  entrevistaAtual: MotoristaEntrevista | null | undefined;
}) {
  const [nota, setNota] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const registrar = useRegistrarEntrevista(motoristaId);

  useEffect(() => {
    if (open) {
      setNota(entrevistaAtual?.nota != null ? String(entrevistaAtual.nota) : '');
      setObservacoes(entrevistaAtual?.observacoes ?? '');
    }
  }, [open, entrevistaAtual]);

  function handleSubmit() {
    const notaNum = Number(nota.replace(',', '.'));
    if (Number.isNaN(notaNum) || notaNum < 0 || notaNum > 10) {
      toast.error('Nota inválida', 'Informe um número entre 0 e 10.');
      return;
    }
    registrar.mutate(
      { nota: notaNum, observacoes },
      {
        onSuccess: () => {
          toast.success('Entrevista registrada', 'O RodaScore foi recalculado.');
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={entrevistaAtual ? 'Atualizar entrevista' : 'Registrar entrevista'}
      description="Nota de 0 a 10 — é o único critério do RodaScore que depende de avaliação humana."
    >
      <div className="space-y-4">
        <div>
          <Label>Nota (0 a 10)</Label>
          <Input type="number" min={0} max={10} step={0.5} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <div>
          <Label>Observações (opcional, não pontuada)</Label>
          <Textarea rows={4} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Impressões da conversa…" />
        </div>
        {registrar.isError && <p className="text-xs text-red-600">Erro ao registrar: {(registrar.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={registrar.isPending || !nota.trim()}>
            {registrar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
