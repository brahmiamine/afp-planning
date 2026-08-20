import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Portée club de la requête en cours. Posée une fois (requireAuth, sockets, routes
 * publiques) puis lue par les couches d'accès aux données du planning : ça évite de
 * faire transiter `clubId` à travers des dizaines de call sites et, surtout, ça fait
 * échouer bruyamment (plutôt que fuiter des données entre clubs) tout accès planning
 * déclenché depuis un contexte qui aurait oublié de la poser.
 */
const storage = new AsyncLocalStorage<string>();

export function setCurrentClubId(clubId: string): void {
  storage.enterWith(clubId);
}

export function runWithClubId<T>(clubId: string, fn: () => T): T {
  return storage.run(clubId, fn);
}

export function getCurrentClubId(): string {
  const clubId = storage.getStore();
  if (!clubId) {
    throw new Error('Contexte club manquant : aucune portée club active pour cette requête');
  }
  return clubId;
}

export function getCurrentClubIdOrNull(): string | null {
  return storage.getStore() ?? null;
}
