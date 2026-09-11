'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/utils/api';

interface ChatRoomUnread {
  unreadCount: number;
}

interface ChatRoomsResponse {
  rooms: ChatRoomUnread[];
}

/**
 * Événement diffusé quand le total de messages non lus du chat change (ex. depuis
 * `ChatView` après réception ou lecture). Permet au badge de la barre mobile de se
 * resynchroniser sans rechargement de page.
 */
export const CHAT_UNREAD_UPDATED_EVENT = 'chat-unread-updated';

export function notifyChatUnreadChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_UNREAD_UPDATED_EVENT));
  }
}

export function useUnreadChatCount() {
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiGet<ChatRoomsResponse>('/api/chat/rooms');
      const total = (data.rooms ?? []).reduce((sum, room) => sum + (room.unreadCount || 0), 0);
      setUnread(total);
    } catch {
      // silencieux : un badge de chat manquant n'est pas bloquant
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const handleUpdate = () => {
      void reload();
    };
    window.addEventListener(CHAT_UNREAD_UPDATED_EVENT, handleUpdate);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, 20_000);
    return () => {
      window.removeEventListener(CHAT_UNREAD_UPDATED_EVENT, handleUpdate);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [reload]);

  return { unread, isLoading, reload };
}
