// GUARDA DE SCHEMA (correção 2026-08-20) — o app é entregue por branch, mas as migrations são
// aplicadas MANUALMENTE no Supabase. Quando o código chega antes da migration, o PostgREST
// devolve "tabela não encontrada" e a tela morria com "Não foi possível carregar. Verifique
// sua conexão." — mensagem FALSA: a conexão está ótima, o recurso é que ainda não existe.
//
// Regra: recurso ausente NÃO é erro de rede e NÃO é lista vazia (que seria mentira: "você não
// tem nada cadastrado"). É um terceiro estado — INDISPONÍVEL — que a tela declara com todas
// as letras. As telas que não dependem do recurso continuam funcionando normalmente.

/** Erros de schema do PostgREST/Postgres: tabela/coluna inexistente. */
export function ehRecursoAusente(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'PGRST205' // tabela fora do schema cache
    || code === 'PGRST204'   // coluna fora do schema cache
    || code === '42P01'      // undefined_table
    || code === '42703';     // undefined_column
}

/** Marca módulos cujo schema ainda não existe neste ambiente (para a UI ser honesta). */
const ausentes = new Set<string>();

export function registrarAusente(modulo: string): void {
  ausentes.add(modulo);
}

export function moduloIndisponivel(modulo: string): boolean {
  return ausentes.has(modulo);
}

/**
 * Executa a leitura e, se o schema do módulo ainda não existir, devolve `vazio` em vez de
 * explodir — registrando o módulo como indisponível para a tela poder avisar. Qualquer outro
 * erro (rede, RLS, permissão) continua subindo normalmente: não engolimos falha de verdade.
 */
export async function lerTolerante<T>(modulo: string, fn: () => Promise<T>, vazio: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (ehRecursoAusente(error)) {
      registrarAusente(modulo);
      return vazio;
    }
    throw error;
  }
}
