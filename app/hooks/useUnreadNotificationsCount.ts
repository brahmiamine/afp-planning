'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '@/lib/utils/api';
import { useInboxRealtime } from '@/hooks/useRealtimeInbox';

interface NotificationCountResponse {
  unread: number;
}

/**
 * Événement diffusé quand l'état lu/non-lu des notifications change (ex. depuis
 * `NotificationsView`). Permet aux badges (sidebar, header, barre mobile) de se
 * resynchroniser sans rechargement de page.
 */
export const NOTIFICATIONS_UPDATED_EVENT = 'notifications-updated';

export function notifyNotificationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
  }
}

export function useUnreadNotificationsCount() {
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const reloadTimer = useRef<number | null>(null);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiGet<NotificationCountResponse>('/api/notifications');
      setUnread(data.unread || 0);
    } catch {
      // silencieux : un badge de notification manquant n'est pas bloquant
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
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleUpdate);
    };
  }, [scheduleReload]);

  useInboxRealtime('notifications', scheduleReload);

  return { unread, isLoading, reload };
}
