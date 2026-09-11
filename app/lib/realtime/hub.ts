/**
 * Pont entre le serveur Socket.IO (monté dans `server.ts`) et les modules HTTP
 * qui doivent pousser un événement temps réel (ex. nouvelle notification in-app).
 * Sans ça, le service de notifications importerait le serveur de chat et créerait
 * un cycle de dépendances.
 */
type RealtimeEmitter = {
  to: (room: string) => { emit: (event: string, ...args: unknown[]) => void };
};

let hub: RealtimeEmitter | null = null;

export function userRealtimeRoom(clubId: string, userId: number): string {
  return `chat:club:${clubId}:user:${userId}`;
}

export function setRealtimeHub(server: RealtimeEmitter | null): void {
  hub = server;
}

export function emitNotificationsChanged(clubId: string, userId: number): void {
  hub?.to(userRealtimeRoom(clubId, userId)).emit('notifications:changed');
}
