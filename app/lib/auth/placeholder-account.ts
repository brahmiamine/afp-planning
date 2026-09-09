import type { DataSource } from 'typeorm';
import type { UserEntity } from '@/lib/db/schemas';

/**
 * Profils de dirigeants « sans accès » (issue #204).
 *
 * Les référentiels de fonctions (arbitre club, encadrant, accompagnateur) créent
 * des profils rattachés au club mais dépourvus d'identifiants de connexion : email
 * technique sur le domaine réservé `sans-acces.local`, mot de passe aléatoire
 * inconnu et `claimedAt` à `null`. Un tel profil n'est pas un compte actif : il ne
 * peut pas se connecter, ne peut pas réinitialiser de mot de passe et n'est pas
 * présenté comme un compte dans l'administration. Il devient un compte lorsque son
 * titulaire accepte une invitation qui le cible (claim), sans perdre ni ses
 * fonctions ni ses affectations.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = 'sans-acces.local';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'personne';
}

export async function generatePlaceholderEmail(db: DataSource, nom: string, tag: string): Promise<string> {
  const userRepo = db.getRepository<UserEntity>('User');
  const base = `${slugify(nom)}.${tag}`;
  let email = `${base}@${PLACEHOLDER_EMAIL_DOMAIN}`;
  let suffix = 1;
  while (await userRepo.findOneBy({ email })) {
    suffix += 1;
    email = `${base}${suffix}@${PLACEHOLDER_EMAIL_DOMAIN}`;
  }
  return email;
}

/** Vrai si l'adresse est une adresse technique de profil sans accès. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** Vrai si le profil a été activé et dispose d'identifiants de connexion connus. */
export function hasAccountAccess(user: Pick<UserEntity, 'claimedAt'>): boolean {
  return user.claimedAt != null;
}
