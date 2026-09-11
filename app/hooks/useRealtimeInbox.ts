'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

type InboxChannel = 'chat' | 'notifications';

type InboxListener = (payload?: unknown) => void;

const listeners: Record<InboxChannel, Set<InboxListener>> = {
  chat: new Set(),
  notifications: new Set(),
};

let socket: Socket | null = null;
let subscriberCount = 0;

function fire(channel: InboxChannel, payload?: unknown) {
  for (const listener of listeners[channel]) listener(payload);
}

function ensureSocket() {
  if (socket || typeof window === 'undefined') return;
  socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
  socket.on('chat:message', (message) => fire('chat', message));
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
export function subscribeInboxRealtime(channel: InboxChannel, listener: InboxListener): () => void {
  listeners[channel].add(listener);
  subscriberCount += 1;
  ensureSocket();
  return () => {
    listeners[channel].delete(listener);
    subscriberCount -= 1;
    releaseSocketIfIdle();
  };
}

export function useInboxRealtime(channel: InboxChannel, onEvent: InboxListener) {
  useEffect(() => subscribeInboxRealtime(channel, onEvent), [channel, onEvent]);
}
