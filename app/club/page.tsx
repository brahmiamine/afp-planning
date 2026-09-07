'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CloudRain,
  PencilRuler,
  Send,
} from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { WeekendEventsOverview } from '@/app/components/events/WeekendEventsOverview';
import { PublishPlanningControl } from '@/app/components/planning/PublishPlanningControl';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';
import { apiPost } from '@/lib/utils/api';
import { eventWorkspaceHref } from '@/lib/planning/event-links';

type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';

interface AlertItem {
  eventId: string;
  eventType: EventType;
  title: string;
  date: string;
  time: string;
  planningStatus: 'draft' | 'published' | 'modified' | 'cancelled';
  missingRoles: PlanningRole[];
  replacementRoles: PlanningRole[];
  pending: number;
  declined: number;
  remindersDue: number;
}

interface AttendanceItem {
  eventId: string;
  eventType: EventType;
  title: string;
  date: string;
  time: string;
  role: PlanningRole;
  personId: number | null;
  personNom: string;
  assignmentStatus: string;
}

const roleLabels: Record<string, string> = {
  arbitre: 'Arbitre',
  encadrant: 'Encadrant',
  accompagnateur: 'Accompagnateur',
  admin: 'Admin',
};

function statusBadge(status: AlertItem['planningStatus']) {
  if (status === 'draft') return <Badge variant="secondary">Brouillon</Badge>;
  if (status === 'modified') return <Badge variant="outline">Modifié</Badge>;
  if (status === 'cancelled') return <Badge variant="destructive">Annulé</Badge>;
  return <Badge>Publié</Badge>;
}

export default function ClubDashboardPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const router = useRouter();
  const editable = canEdit(user?.roles);
  const { data, loading: dashboardLoading, busyKey, action, reload: reloadDashboard } = useDashboardData(editable);
  const [weekendRefreshKey, setWeekendRefreshKey] = useState(0);

  useEffect(() => {
    if (!authLoading && user && !canEdit(user.roles)) router.replace('/mon-planning');
  }, [authLoading, user, router]);

  const reloadAll = useCallback(async () => {
    await reloadDashboard();
    setWeekendRefreshKey((value) => value + 1);
  }, [reloadDashboard]);

  const remind = (item: AlertItem) => action(
    `remind:${item.eventId}`,
    () => apiPost('/api/planning/reminders', {
      eventType: item.eventType,
      eventId: item.eventId,
    }),
    'Relance(s) envoyée(s)',
  );

  const markAttendance = (
    item: AttendanceItem,
    status: 'present' | 'excused' | 'absent' | 'replaced',
  ) => action(
    `attendance:${item.eventId}:${item.role}:${item.personId ?? item.personNom}`,
    () => apiPost('/api/planning/attendance', {
      eventType: item.eventType,
      eventId: item.eventId,
      role: item.role,
      personId: item.personId,
      personNom: item.personNom,
      status,
    }),
    'Présence enregistrée',
  );

  if (authLoading || !user || !canEdit(user.roles)) {
    return <LoadingSpinner size={44} text="Chargement..." className="min-h-screen" />;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Cockpit de pilotage</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ce qui nécessite votre attention</h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Suivez les prochains événements, les réponses, les remplacements et les modifications à publier.
            La création et l’affectation se font dans l’espace de préparation.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <Button variant="outline" asChild>
            <Link href="/club/planning">
              <PencilRuler className="mr-2 h-4 w-4" />
              {data?.alerts.length ? `Corriger les ${data.alerts.length} alerte(s)` : 'Ouvrir le planning'}
            </Link>
          </Button>
          <PublishPlanningControl context="dashboard" onPublished={reloadAll} />
        </div>
      </header>

      <WeekendEventsOverview refreshKey={weekendRefreshKey} />

      {data && data.weatherAlerts.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><CloudRain className="h-5 w-5" /> Alertes météo du week-end</h2>
            <p className="text-sm text-muted-foreground">Informations indicatives ; aucune modification automatique du planning.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.weatherAlerts.map((item) => (
              <Card key={`${item.eventType}:${item.eventId}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{item.title}</p><p className="text-sm text-muted-foreground">{item.date} · {item.time}</p></div>
                    <Badge variant={item.weather.severity === 'severe' ? 'destructive' : 'outline'}>{item.weather.severity === 'severe' ? 'Sévère' : 'Vigilance'}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{item.weather.alerts.join(' · ')}</p>
                  <Button className="mt-3" size="sm" variant="outline" asChild>
                    <Link href={eventWorkspaceHref(item.eventType, item.eventId, 'dashboard')}>Ouvrir l’événement</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div><h2 className="text-lg font-semibold">Priorités opérationnelles</h2><p className="text-sm text-muted-foreground">Publication, postes manquants, refus, remplacements et relances.</p></div>
          {dashboardLoading && !data ? null : <Badge variant={data?.alerts.length ? 'destructive' : 'outline'}>{data?.alerts.length ?? 0} alerte(s)</Badge>}
        </div>
        {dashboardLoading && !data ? (
          <LoadingSpinner size={36} text="Analyse du planning..." className="py-10" />
        ) : !data?.alerts.length ? (
          <Card><CardContent className="flex items-center justify-center gap-2 py-10 text-emerald-600"><CheckCircle2 className="h-5 w-5" /> Aucun point bloquant.</CardContent></Card>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {data.alerts.map((item) => (
              <Card key={`${item.eventType}:${item.eventId}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div><CardTitle className="text-base">{item.title}</CardTitle><p className="text-sm text-muted-foreground">{item.date} · {item.time}</p></div>
                    {statusBadge(item.planningStatus)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.missingRoles.map((role) => <Badge key={`m-${role}`} variant="destructive">Manque {roleLabels[role]}</Badge>)}
                    {item.replacementRoles.map((role) => <Badge key={`r-${role}`} variant="destructive">Remplacer {roleLabels[role]}</Badge>)}
                    {!!item.pending && <Badge variant="outline">{item.pending} en attente</Badge>}
                    {!!item.declined && <Badge variant="destructive">{item.declined} refus</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!!item.pending && item.planningStatus === 'published' && <Button size="sm" variant="outline" onClick={() => remind(item)} disabled={busyKey !== null}><Send className="mr-1 h-3.5 w-3.5" /> Relancer</Button>}
                    <Button size="sm" variant="default" asChild>
                      <Link href={eventWorkspaceHref(item.eventType, item.eventId, 'dashboard')}>
                        {item.missingRoles.length || item.replacementRoles.length ? 'Corriger dans le planning' : 'Ouvrir l’événement'}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {!!data?.attendance.length && (
        <section>
          <div className="mb-3"><h2 className="text-lg font-semibold">Présences à clôturer</h2><p className="text-sm text-muted-foreground">Événements terminés récemment sans présence enregistrée.</p></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.attendance.slice(0, 12).map((item) => (
              <Card key={`${item.eventId}:${item.role}:${item.personId ?? item.personNom}`}>
                <CardContent className="space-y-3 p-4">
                  <div><p className="font-medium">{item.personNom}</p><p className="text-sm text-muted-foreground">{roleLabels[item.role]} · {item.title} · {item.date} {item.time}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => markAttendance(item, 'present')} disabled={busyKey !== null}>Présent</Button>
                    <Button size="sm" variant="outline" onClick={() => markAttendance(item, 'excused')} disabled={busyKey !== null}>Excusé</Button>
                    <Button size="sm" variant="destructive" onClick={() => markAttendance(item, 'absent')} disabled={busyKey !== null}>Absent</Button>
                    <Button size="sm" variant="outline" onClick={() => markAttendance(item, 'replaced')} disabled={busyKey !== null}>Remplacé</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
