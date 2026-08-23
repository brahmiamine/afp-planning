'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet, apiPatch } from '@/lib/utils/api';
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
}

interface NotificationResponse {
  notifications: NotificationItem[];
  unread: number;
}

export default function NotificationsPage() {
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<NotificationResponse>('/api/notifications'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAllRead = async () => {
    await apiPatch('/api/notifications', { all: true });
    await load();
  };

  const markRead = async (id: number) => {
    await apiPatch('/api/notifications', { id });
    await load();
  };

  return (
    <div className="max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <Bell className="h-6 w-6" /> Notifications
            </h2>
            <p className="text-sm text-muted-foreground">
              Affectations, réponses et changements importants de planning.
            </p>
          </div>
          <Button variant="outline" onClick={markAllRead} disabled={!data?.unread}>
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
            {data.notifications.map((item) => (
              <Card key={item.id} className={item.readAt ? '' : 'border-primary/40 bg-primary/5'}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription>
                        {new Date(item.createdAt).toLocaleString('fr-FR')}
                      </CardDescription>
                    </div>
                    {!item.readAt && <Badge>Nouveau</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-4">
                  <p className="text-sm">{item.message}</p>
                  {!item.readAt && (
                    <Button variant="ghost" size="sm" onClick={() => markRead(item.id)}>
                      Marquer lu
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
