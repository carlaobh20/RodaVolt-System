import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRodaScoreResultado,
  listRodaScoreFlags,
  getMotoristaEntrevista,
  listMotoristaDecisoes,
  recalcularRodaScore,
  registrarEntrevista,
  registrarDecisao,
  resolverFlag,
  criarFlagManual,
  listCandidatosRodaScore,
  type RodaScoreFlagSeveridade,
  type MotoristaDecisaoTipo,
} from '../api/rodaScore';

// Mesmo padrão de hooks já usado por useComentarios/useInteracoes: useQuery por recurso,
// useMutation invalidando as queries afetadas. RodaScoreTab.tsx é o único consumidor.

export function useRodaScoreResultado(motoristaId: string) {
  return useQuery({
    queryKey: ['rodascore-resultado', motoristaId],
    queryFn: () => getRodaScoreResultado(motoristaId),
    enabled: !!motoristaId,
  });
}

export function useRodaScoreFlags(motoristaId: string) {
  return useQuery({
    queryKey: ['rodascore-flags', motoristaId],
    queryFn: () => listRodaScoreFlags(motoristaId),
    enabled: !!motoristaId,
  });
}

export function useMotoristaEntrevista(motoristaId: string) {
  return useQuery({
    queryKey: ['motorista-entrevista', motoristaId],
    queryFn: () => getMotoristaEntrevista(motoristaId),
    enabled: !!motoristaId,
  });
}

export function useMotoristaDecisoes(motoristaId: string) {
  return useQuery({
    queryKey: ['motorista-decisoes', motoristaId],
    queryFn: () => listMotoristaDecisoes(motoristaId),
    enabled: !!motoristaId,
  });
}

function useInvalidarRodaScore(motoristaId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['rodascore-resultado', motoristaId] });
    queryClient.invalidateQueries({ queryKey: ['rodascore-flags', motoristaId] });
    queryClient.invalidateQueries({ queryKey: ['candidatos-rodascore'] });
  };
}

export function useRecalcularRodaScore(motoristaId: string) {
  const invalidar = useInvalidarRodaScore(motoristaId);
  return useMutation({
    mutationFn: () => recalcularRodaScore(motoristaId),
    onSuccess: invalidar,
  });
}

export function useRegistrarEntrevista(motoristaId: string) {
  const invalidar = useInvalidarRodaScore(motoristaId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nota, observacoes }: { nota: number; observacoes: string }) => registrarEntrevista(motoristaId, nota, observacoes),
    onSuccess: () => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ['motorista-entrevista', motoristaId] });
    },
  });
}

export function useRegistrarDecisao(motoristaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tipoDecisao, justificativa }: { tipoDecisao: MotoristaDecisaoTipo; justificativa: string }) =>
      registrarDecisao(motoristaId, tipoDecisao, justificativa),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['motorista-decisoes', motoristaId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', 'motorista', motoristaId] });
      queryClient.invalidateQueries({ queryKey: ['candidatos-rodascore'] });
    },
  });
}

export function useResolverFlag(motoristaId: string, usuarioId: string | undefined) {
  const invalidar = useInvalidarRodaScore(motoristaId);
  return useMutation({
    mutationFn: (flagId: string) => resolverFlag(flagId, usuarioId),
    onSuccess: invalidar,
  });
}

export function useCriarFlagManual(motoristaId: string, usuarioId: string | undefined) {
  const invalidar = useInvalidarRodaScore(motoristaId);
  return useMutation({
    mutationFn: ({ empresaId, descricao, severidade }: { empresaId: string; descricao: string; severidade: RodaScoreFlagSeveridade }) =>
      criarFlagManual(motoristaId, empresaId, descricao, severidade, usuarioId),
    onSuccess: invalidar,
  });
}

// Painel "Candidatos" (CandidatosRodaScorePage). Lista todo mundo que já tem RodaScore
// calculado — ver comentário em listCandidatosRodaScore sobre por que o filtro fica no cliente.
export function useCandidatosRodaScore() {
  return useQuery({
    queryKey: ['candidatos-rodascore'],
    queryFn: listCandidatosRodaScore,
  });
}
