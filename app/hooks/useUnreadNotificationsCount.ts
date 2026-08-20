'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/utils/api';

interface NotificationCountResponse {
  unread: number;
}

export function useUnreadNotificationsCount() {
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    reload();
  }, [reload]);

  return { unread, isLoading, reload };
}
