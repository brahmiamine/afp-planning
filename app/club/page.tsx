'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CloudRain,
  Clock3,
  History,
  Link2,
  RefreshCw,
  Send,
  Sparkles,
  UserCheck,
  Users,
  UserX,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';
import { apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

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

interface WorkloadItem {
  identity: string;
  nom: string;
  upcoming: number;
  last30Days: number;
  declined: number;
  absences: number;
}

interface DashboardData {
  generatedAt: string;
  totals: {
    events: number;
    upcoming: number;
    nextWeek: number;
    weekend: number;
    complete: number;
    attention: number;
    missingRoles: number;
    pending: number;
    declined: number;
    replacements: number;
    remindersDue: number;
    attendancePending: number;
    present: number;
    excused: number;
    absent: number;
    replaced: number;
    unreadNotifications: number;
    activeUsers: number;
  };
  publication: { draft: number; published: number; modified: number; cancelled: number };
  usersByRole: Record<string, number>;
  alerts: AlertItem[];
  attendance: AttendanceItem[];
  workload: WorkloadItem[];
  recentNotifications: Array<{ id: number; title: string; message: string; createdAt: string }>;
  analytics: {
    acceptanceRate: number;
    attendanceRate: number;
    averageResponseDelayMinutes: number | null;
    replacementRate: number;
    missingCoverageRate: number;
    fairnessCoefficient: number;
  };
  weekend: { total: number; ready: number; attention: number };
  history: Array<{ id: number; title: string; actor: string; createdAt: string }>;
  weatherAlerts: Array<{
    eventId: string;
    eventType: EventType;
    title: string;
    date: string;
    time: string;
    weather: {
      available: true;
      severity: 'warning' | 'severe';
      alerts: string[];
      temperatureC: number | null;
    };
  }>;
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
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && !canEdit(user.roles)) router.replace('/mon-planning');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (!canEdit(user?.roles)) return;
    setLoading(true);
    try {
      setData(await apiGet<DashboardData>('/api/dashboard/club'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger le dashboard');
    } finally {
      setLoading(false);
    }
  }, [user?.roles]);

  useEffect(() => {
    load();
  }, [load]);

  const action = useCallback(async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusyKey(key);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible');
    } finally {
      setBusyKey(null);
    }
  }, [load]);

  const publicationAction = (
    item: AlertItem,
    actionName: 'publish' | 'draft' | 'cancel' | 'reopen',
  ) => action(
    `publication:${item.eventType}:${item.eventId}`,
    () => apiPost('/api/planning/publication', {
      eventType: item.eventType,
      eventId: item.eventId,
      action: actionName,
    }),
    actionName === 'publish' ? 'Planning publié' : 'Statut du planning mis à jour',
  );

  const autoAssign = (item: AlertItem, role: PlanningRole) => action(
    `assign:${item.eventId}:${role}`,
    () => apiPost('/api/planning/auto-assign', {
      eventType: item.eventType,
      eventId: item.eventId,
      role,
    }),
    `${roleLabels[role]} affecté automatiquement`,
  );

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

  const workloadMax = useMemo(
    () => Math.max(1, ...(data?.workload.map((item) => item.upcoming + item.last30Days) ?? [1])),
    [data],
  );

  if (authLoading || !user || !canEdit(user.roles)) {
    return <LoadingSpinner size={44} text="Chargement..." className="min-h-screen" />;
  }

  return (
    <div className="space-y-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Dashboard Club</h2>
            <p className="text-sm text-muted-foreground">
              Vue complète du planning, des affectations, de la disponibilité, de la charge et des alertes.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
        </div>

        {loading && !data ? (
          <LoadingSpinner size={44} text="Analyse du planning..." className="py-20" />
        ) : data ? (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {[
                ['À venir', data.totals.upcoming, CalendarClock],
                ['7 prochains jours', data.totals.nextWeek, CalendarCheck2],
                ['Ce week-end', data.totals.weekend, CalendarCheck2],
                ['Complets', data.totals.complete, CheckCircle2],
                ['À traiter', data.totals.attention, AlertTriangle],
                ['Rôles manquants', data.totals.missingRoles, UserX],
                ['Remplacements', data.totals.replacements, UserX],
                ['En attente', data.totals.pending, Clock3],
                ['Refus', data.totals.declined, XCircle],
                ['Relances dues', data.totals.remindersDue, Send],
                ['Présences à saisir', data.totals.attendancePending, UserCheck],
                ['Notifications', data.totals.unreadNotifications, Bell],
              ].map(([label, value, Icon]) => {
                const IconComponent = Icon as typeof Activity;
                return (
                  <Card key={String(label)}>
                    <CardContent className="p-4">
                      <IconComponent className="mb-2 h-4 w-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{String(label)}</p>
                      <p className="text-2xl font-bold">{String(value)}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader><CardTitle className="text-base">Santé du planning</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground">Acceptation</p><p className="text-xl font-semibold">{data.analytics.acceptanceRate.toFixed(1)} %</p></div>
                  <div><p className="text-muted-foreground">Présence</p><p className="text-xl font-semibold">{data.analytics.attendanceRate.toFixed(1)} %</p></div>
                  <div><p className="text-muted-foreground">Couverture manquante</p><p className="text-xl font-semibold">{data.analytics.missingCoverageRate.toFixed(1)} %</p></div>
                  <div><p className="text-muted-foreground">Équité</p><p className="text-xl font-semibold">{Math.round(data.analytics.fairnessCoefficient * 100)} / 100</p></div>
                  <div><p className="text-muted-foreground">Remplacements</p><p className="text-xl font-semibold">{data.analytics.replacementRate.toFixed(1)} %</p></div>
                  <div><p className="text-muted-foreground">Réponse moyenne</p><p className="text-xl font-semibold">{data.analytics.averageResponseDelayMinutes === null ? '—' : `${Math.round(data.analytics.averageResponseDelayMinutes)} min`}</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Week-end</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div><p className="text-muted-foreground">Total</p><strong>{data.weekend.total}</strong></div>
                    <div><p className="text-muted-foreground">Prêts</p><strong className="text-emerald-600">{data.weekend.ready}</strong></div>
                    <div><p className="text-muted-foreground">À traiter</p><strong className="text-destructive">{data.weekend.attention}</strong></div>
                  </div>
                  <Button variant="outline" size="sm" asChild><Link href="/club/planning/week-end">Ouvrir le week-end</Link></Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Accès rapides</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" asChild><Link href="/club/planning/statistiques"><BarChart3 className="mr-2 h-4 w-4" /> Stats</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link href="/club/planning/partage"><Link2 className="mr-2 h-4 w-4" /> Partage</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link href="/club/planning/ressources"><Wrench className="mr-2 h-4 w-4" /> Ressources</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link href="/club/planning/outils"><Wrench className="mr-2 h-4 w-4" /> Outils</Link></Button>
                </CardContent>
              </Card>
            </section>

            {data.weatherAlerts.length > 0 && (
              <section>
                <div className="mb-3">
                  <h3 className="flex items-center gap-2 text-lg font-semibold"><CloudRain className="h-5 w-5" /> Alertes météo du week-end</h3>
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div><h3 className="text-lg font-semibold">Priorités opérationnelles</h3><p className="text-sm text-muted-foreground">Publication, postes manquants, refus, remplacements et relances.</p></div>
                <Badge variant={data.alerts.length ? 'destructive' : 'outline'}>{data.alerts.length} alerte(s)</Badge>
              </div>
              {!data.alerts.length ? (
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
                          {item.planningStatus === 'draft' && <Button size="sm" onClick={() => publicationAction(item, 'publish')} disabled={busyKey !== null}>Publier</Button>}
                          {item.planningStatus === 'modified' && <Button size="sm" onClick={() => publicationAction(item, 'publish')} disabled={busyKey !== null}>Republier</Button>}
                          {(item.planningStatus === 'published' || item.planningStatus === 'modified') && <><Button size="sm" variant="outline" onClick={() => publicationAction(item, 'draft')} disabled={busyKey !== null}>Brouillon</Button><Button size="sm" variant="destructive" onClick={() => publicationAction(item, 'cancel')} disabled={busyKey !== null}>Annuler</Button></>}
                          {item.planningStatus === 'cancelled' && <Button size="sm" variant="outline" onClick={() => publicationAction(item, 'reopen')} disabled={busyKey !== null}>Rouvrir</Button>}
                          {item.planningStatus !== 'cancelled' && [...new Set([...item.missingRoles, ...item.replacementRoles])].map((role) => <Button key={role} size="sm" variant="outline" onClick={() => autoAssign(item, role)} disabled={busyKey !== null}><Sparkles className="mr-1 h-3.5 w-3.5" /> Auto-affecter {roleLabels[role]}</Button>)}
                          {!!item.pending && (item.planningStatus === 'published' || item.planningStatus === 'modified') && <Button size="sm" variant="outline" onClick={() => remind(item)} disabled={busyKey !== null}><Send className="mr-1 h-3.5 w-3.5" /> Relancer</Button>}
                          <Button size="sm" variant="ghost" asChild><Link href={`/club/planning/evenement/${item.eventType}/${encodeURIComponent(item.eventId)}`}>Détails</Link></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3"><h3 className="text-lg font-semibold">Présences à clôturer</h3><p className="text-sm text-muted-foreground">Événements terminés récemment sans présence enregistrée.</p></div>
              {!data.attendance.length ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Toutes les présences récentes sont renseignées.</CardContent></Card>
              ) : (
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
              )}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Charge des personnes</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.workload.slice(0, 12).map((item) => {
                    const value = item.upcoming + item.last30Days;
                    return (
                      <div key={item.identity} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{item.nom}</span><span className="text-xs text-muted-foreground">{item.upcoming} à venir · {item.last30Days} / 30j · {item.declined} refus</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (value / workloadMax) * 100)}%` }} /></div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Notifications récentes</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.recentNotifications.length ? data.recentNotifications.map((item) => <div key={item.id} className="border-b pb-2 last:border-0"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.message}</p></div>) : <p className="text-sm text-muted-foreground">Aucune notification récente.</p>}
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Historique lisible</CardTitle></CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {data.history.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.actor} · {new Date(item.createdAt).toLocaleString('fr-FR')}</p></div>)}
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground">Dernière analyse : {new Date(data.generatedAt).toLocaleString('fr-FR')}</p>
          </>
        ) : null}
    </div>
  );
}
