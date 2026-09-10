import { createHash, randomBytes } from 'node:crypto';

/**
 * Jetons d'invitation (issue #271) : le jeton brut n'est jamais stocké en base,
 * seule son empreinte SHA-256 l'est — même principe que les jetons de
 * réinitialisation de mot de passe et de partage public.
 */
export function newInvitationToken(): string {
  return randomBytes(24).toString('hex');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Résout le paramètre URL admin (jeton brut ou empreinte déjà hashée — issue #378). */
export function resolveInvitationLookupId(token: string): string {
  const trimmed = token.trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return hashInvitationToken(trimmed);
}
