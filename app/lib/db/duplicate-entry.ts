/** Erreur MariaDB/MySQL de contrainte UNIQUE ou PRIMARY KEY dupliquée. */
export function isDuplicateEntryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062;
}
