'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { TeamLogo } from '@/app/components/ui/team-logo';
import { apiGet, apiPatch } from '@/lib/utils/api';
import { notifyNotificationsChanged } from '@/hooks/useUnreadNotificationsCount';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { notificationDestinationHref } from '@/lib/notifications/destinations';
import { isInteractiveTarget } from '@/lib/planning/event-links';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  eventType: string | null;
  eventId: string | null;
  readAt: string | null;
  createdAt: string;
  /** Ajoutés côté API pour les notifications liées à un match (logos des deux clubs). */
  localTeam?: string;
  awayTeam?: string;
  localTeamLogo?: string;
  awayTeamLogo?: string;
}

interface NotificationResponse {
  notifications: NotificationItem[];
  unread: number;
  hasMore?: boolean;
  nextBeforeId?: number | null;
}

type StatusFilter = 'all' | 'unread' | 'read';

/**
 * Vue unique des notifications, partagée entre /club et /mon-planning (issue #93).
 * Rendu en cartes empilées responsive, identique dans les deux espaces.
 */
export function NotificationsView({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const { settings } = useAppSettings();
  const { user } = useCurrentUser();
  const router = useRouter();
  const clubLogo = settings.clubLogo;
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      setData(await apiGet<NotificationResponse>('/api/notifications?withLogos=1'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!data?.hasMore || !data.nextBeforeId) return;
    setLoadingMore(true);
    try {
      const page = await apiGet<NotificationResponse>(
        `/api/notifications?withLogos=1&beforeId=${data.nextBeforeId}`,
      );
      setData((prev) => {
        if (!prev) return page;
        const seen = new Set(prev.notifications.map((item) => item.id));
        const merged = [
          ...prev.notifications,
          ...page.notifications.filter((item) => !seen.has(item.id)),
        ];
        return { ...page, notifications: merged };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les notifications');
    } finally {
      setLoadingMore(false);
    }
  }, [data?.hasMore, data?.nextBeforeId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const markAllRead = async () => {
    await apiPatch('/api/notifications', { all: true });
    await load();
    notifyNotificationsChanged();
  };

  const markRead = async (id: number) => {
    await apiPatch('/api/notifications', { id });
    await load();
    notifyNotificationsChanged();
  };

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const item of data?.notifications ?? []) set.add(item.type);
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    return (data?.notifications ?? []).filter((item) => {
      if (status === 'unread' && item.readAt) return false;
      if (status === 'read' && !item.readAt) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      return true;
    });
  }, [data, status, typeFilter]);

  const renderIcon = (item: NotificationItem) => {
    const isEvent = Boolean(item.eventType && item.eventId);
    if (isEvent && (item.localTeamLogo || item.awayTeamLogo || item.localTeam || item.awayTeam)) {
      return (
        <div className="flex -space-x-2">
          <TeamLogo logo={item.localTeamLogo} name={item.localTeam ?? ''} size={32} className="h-8 w-8 border" />
          <TeamLogo logo={item.awayTeamLogo} name={item.awayTeam ?? ''} size={32} className="h-8 w-8 border" />
        </div>
      );
    }
    if (isEvent) {
      return <TeamLogo logo={clubLogo || undefined} name="" size={32} className="h-8 w-8 border bg-white" />;
    }
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
        <Bell className="h-4 w-4 text-muted-foreground" />
      </span>
    );
  };

  const filterBar = (
    <div className="flex flex-wrap gap-2">
      <select
        className="h-9 min-w-[7.5rem] flex-1 rounded-md border border-input bg-background px-3 text-sm sm:flex-none"
        value={status}
        onChange={(e) => setStatus(e.target.value as StatusFilter)}
      >
        <option value="all">Toutes</option>
        <option value="unread">Non lues</option>
        <option value="read">Lues</option>
      </select>
      <select
        className="h-9 min-w-[7.5rem] flex-1 rounded-md border border-input bg-background px-3 text-sm sm:flex-none"
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value)}
      >
        <option value="all">Tous les types</option>
        {types.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Bell className="h-6 w-6" /> Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Affectations, réponses et changements importants de planning.
          </p>
        </div>
        <Button variant="outline" onClick={markAllRead} disabled={!data?.unread} className="self-start sm:self-auto">
          <CheckCheck className="mr-2 h-4 w-4" /> Tout lire
        </Button>
      </div>

      {loading ? (
        <LoadingSpinner size={40} text="Chargement..." className="py-20" />
      ) : !data?.notifications.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Aucune notification.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filterBar}

          <ul className="space-y-2.5">
              {filtered.length === 0 ? (
                <li className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
                  Aucune notification ne correspond aux filtres
                </li>
              ) : (
                filtered.map((item) => {
                  const href = notificationDestinationHref({
                    accessRole: user?.accessRole,
                    type: item.type,
                    eventType: item.eventType,
                    eventId: item.eventId,
                  });
                  return (
                  <li key={item.id}>
                    <div
                      role="link"
                      tabIndex={0}
                      aria-label={item.title}
                      onClick={(event) => {
                        if (isInteractiveTarget(event.target)) return;
                        if (!item.readAt) void markRead(item.id);
                        router.push(href);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        if (!item.readAt) void markRead(item.id);
                        router.push(href);
                      }}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-xl border p-3 sm:p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        item.readAt ? 'bg-card' : 'border-primary/40 bg-primary/5',
                      )}
                    >
                      <div className="shrink-0 pt-0.5">{renderIcon(item)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                          <p className="text-sm font-medium leading-snug break-words">{item.title}</p>
                          {!item.readAt && <Badge className="shrink-0">Nouveau</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground break-words">{item.message}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{new Date(item.createdAt).toLocaleString('fr-FR')}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5">{item.type}</span>
                          {!item.readAt && (
                            <button
                              type="button"
                              onClick={() => markRead(item.id)}
                              className="font-medium text-primary hover:underline"
                            >
                              Marquer lu
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                  );
                })
              )}
            </ul>

          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {filtered.length} / {data.notifications.length} notification{data.notifications.length > 1 ? 's' : ''}
            </p>
            {data.hasMore && (
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Chargement…' : 'Voir plus'}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
