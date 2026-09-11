'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

type InboxChannel = 'chat' | 'notifications';

const listeners: Record<InboxChannel, Set<() => void>> = {
  chat: new Set(),
  notifications: new Set(),
};

let socket: Socket | null = null;
let subscriberCount = 0;

function fire(channel: InboxChannel) {
  for (const listener of listeners[channel]) listener();
}

function ensureSocket() {
  if (socket || typeof window === 'undefined') return;
  socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('chat:message', () => fire('chat'));
  socket.on('chat:read', () => fire('chat'));
  socket.on('chat:room-touched', () => fire('chat'));
  socket.on('notifications:changed', () => fire('notifications'));
}

function releaseSocketIfIdle() {
  if (subscriberCount > 0 || !socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/**
 * Un seul socket partagé pour les badges Chat / Notifications (header, barre
 * mobile, sidebar). Évite d'ouvrir une connexion par composant.
 */
export function subscribeInboxRealtime(channel: InboxChannel, listener: () => void): () => void {
  listeners[channel].add(listener);
  subscriberCount += 1;
  ensureSocket();
  return () => {
    listeners[channel].delete(listener);
    subscriberCount -= 1;
    releaseSocketIfIdle();
  };
}

export function useInboxRealtime(channel: InboxChannel, onEvent: () => void) {
  useEffect(() => subscribeInboxRealtime(channel, onEvent), [channel, onEvent]);
}
