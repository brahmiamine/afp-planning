'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '@/lib/utils/api';
import { useInboxRealtime } from '@/hooks/useRealtimeInbox';

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
  const reloadTimer = useRef<number | null>(null);

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

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      void reload();
    }, 250);
  }, [reload]);

  useEffect(() => {
    reload();
    return () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    };
  }, [reload]);

  useEffect(() => {
    const handleUpdate = () => {
      scheduleReload();
    };
    window.addEventListener(CHAT_UNREAD_UPDATED_EVENT, handleUpdate);
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleReload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(CHAT_UNREAD_UPDATED_EVENT, handleUpdate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [scheduleReload]);

  useInboxRealtime('chat', scheduleReload);

  return { unread, isLoading, reload };
}
