'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  RefreshCw,
  Send,
  Sparkles,
  UserCheck,
  UserRoundCheck,
  Users,
  UserX,
} from 'lucide-react';
import { Header } from '@/app/components/layout/Header';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

interface AlertItem {
  eventId: string;
  eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau';
  title: string;
  date: string;
  time: string;
  planningStatus: 'draft' | 'published' | 'modified' | 'cancelled';
  missingRoles: Array<'arbitre' | 'encadrant' | 'accompagnateur'>;
  replacementRoles: Array<'arbitre' | 'encadrant' | 'accompagnateur'>;
  pending: number;
  declined: number;
  remindersDue: number;
}

interface AttendanceItem {
  eventId: string;
  eventType: AlertItem['eventType'];
  title: string;
  date: string;
  time: string;
  role: 'arbitre' | 'encadrant' | 'accompagnateur';
  personId: number | null;
  personNom: string;
  assignmentStatus: string;
}

interface WorkloadItem {
  identity: string;
  personId: number | null;
  personType: string | null;
  nom: string;
  upcoming: number;
  last30Days: number;
  accepted: number;
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
  recentNotifications: Array<{
    id: number;
    type: string;
    title: string;
    message: string;
    createdAt: string;
  }>;
  recentAudit: Array<{
    id: number;
    entityType: string;
    entityId: string;
    action: string;
    userNom: string | null;
    userEmail: string | null;
    createdAt: string;
  }>;
}

const roleLabels: Record<string, string> = {
  arbitre: 'Arbitre',
  encadrant: 'Encadrant',
  accompagnateur: 'Accompagnateur',
  superadmin: 'Super admin',
  admin: 'Admin',
};

function statusBadge(status: AlertItem['planningStatus']) {
  if (status === 'draft') return <Badge variant="secondary">Brouillon</Badge>;
  if (status === 'modified') return <Badge variant="outline">Modifié</Badge>;
  if (status === 'cancelled') return <Badge variant="destructive">Annulé</Badge>;
  return <Badge>Publié</Badge>;
}

export default function SuperadminDashboardPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'superadmin') router.replace('/');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (user?.role !== 'superadmin') return;
    setLoading(true);
    try {
      setData(await apiGet<DashboardData>('/api/dashboard/superadmin'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger le dashboard');
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => { load(); }, [load]);

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

  const publicationAction = (item: AlertItem, publicationActionName: 'publish' | 'draft' | 'cancel' | 'reopen') =>
    action(
      `publication:${item.eventType}:${item.eventId}`,
      () => apiPost('/api/planning/publication', {
        eventType: item.eventType,
        eventId: item.eventId,
        action: publicationActionName,
      }),
      publicationActionName === 'publish' ? 'Planning publié' : 'Statut du planning mis à jour',
    );

  const autoAssign = (item: AlertItem, role: string) =>
    action(
      `assign:${item.eventId}:${role}`,
      () => apiPost('/api/planning/auto-assign', {
        eventType: item.eventType,
        eventId: item.eventId,
        role,
      }),
      `${roleLabels[role] ?? role} affecté automatiquement`,
    );

  const remind = (item: AlertItem) =>
    action(
      `remind:${item.eventId}`,
      () => apiPost('/api/planning/reminders', {
        eventType: item.eventType,
        eventId: item.eventId,
      }),
      'Relance(s) envoyée(s)',
    );

  const attendance = (item: AttendanceItem, status: 'present' | 'excused' | 'absent' | 'replaced') =>
    action(
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

  if (authLoading || !user || user.role !== 'superadmin') {
    return <LoadingSpinner size={44} text="Chargement..." className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={load} />
      <main className="container mx-auto space-y-7 px-3 py-6 sm:px-4 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Dashboard Super Admin</h2>
            <p className="text-sm text-muted-foreground">Pilotage opérationnel du planning, des affectations et des présences.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
        </div>

        {loading && !data ? (
          <LoadingSpinner size={44} text="Analyse du planning..." className="py-20" />
        ) : data ? (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              {[
                ['À venir', data.totals.upcoming, CalendarClock],
                ['7 prochains jours', data.totals.nextWeek, CalendarCheck2],
                ['Ce week-end', data.totals.weekend, CalendarCheck2],
                ['À traiter', data.totals.attention, AlertTriangle],
                ['Remplacements', data.totals.replacements, UserX],
                ['En attente', data.totals.pending, Clock3],
                ['Relances dues', data.totals.remindersDue, Send],
                ['Présences à saisir', data.totals.attendancePending, UserCheck],
              ].map(([label, value, Icon]) => {
                const IconComponent = Icon as typeof Activity;
                return (
                  <Card key={String(label)}>
                    <CardContent className="p-4">
                      <IconComponent className="mb-2 h-4 w-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-2xl font-bold">{String(value)}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader><CardTitle className="text-base">Publication</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground">Brouillons</p><p className="text-xl font-semibold">{data.publication.draft}</p></div>
                  <div><p className="text-muted-foreground">Publiés</p><p className="text-xl font-semibold">{data.publication.published}</p></div>
                  <div><p className="text-muted-foreground">Modifiés</p><p className="text-xl font-semibold">{data.publication.modified}</p></div>
                  <div><p className="text-muted-foreground">Annulés</p><p className="text-xl font-semibold">{data.publication.cancelled}</p></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Présence réelle</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground">Présents</p><p className="text-xl font-semibold">{data.totals.present}</p></div>
                  <div><p className="text-muted-foreground">Excusés</p><p className="text-xl font-semibold">{data.totals.excused}</p></div>
                  <div><p className="text-muted-foreground">Absents</p><p className="text-xl font-semibold text-destructive">{data.totals.absent}</p></div>
                  <div><p className="text-muted-foreground">Remplacés</p><p className="text-xl font-semibold">{data.totals.replaced}</p></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Utilisateurs</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Actifs</span><strong>{data.totals.activeUsers}</strong></div>
                  {Object.entries(data.usersByRole).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between"><span>{roleLabels[role] ?? role}</span><span>{count}</span></div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-2"><span className="flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications non lues</span><strong>{data.totals.unreadNotifications}</strong></div>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Priorités opérationnelles</h3>
                  <p className="text-sm text-muted-foreground">14 prochains jours : publication, postes manquants, refus et relances.</p>
                </div>
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
                          <div><CardTitle className="text-base">{item.title}</CardTitle><p className="text-sm text-muted-foreground">{item.date} · {item.time} · {item.eventType}</p></div>
                          {statusBadge(item.planningStatus)}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          {item.missingRoles.map((role) => <Badge key={`missing-${role}`} variant="destructive">Manque {roleLabels[role]}</Badge>)}
                          {item.replacementRoles.map((role) => <Badge key={`replacement-${role}`} variant="destructive">Remplacer {roleLabels[role]}</Badge>)}
                          {!!item.pending && <Badge variant="outline">{item.pending} en attente</Badge>}
                          {!!item.declined && <Badge variant="destructive">{item.declined} refus</Badge>}
                          {!!item.remindersDue && <Badge variant="secondary">{item.remindersDue} relance(s) due(s)</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.planningStatus === 'draft' && (
                            <Button size="sm" onClick={() => publicationAction(item, 'publish')} disabled={busyKey !== null}>Publier</Button>
                          )}
                          {item.planningStatus === 'modified' && (
                            <Button size="sm" onClick={() => publicationAction(item, 'publish')} disabled={busyKey !== null}>Republier</Button>
                          )}
                          {(item.planningStatus === 'published' || item.planningStatus === 'modified') && (
                            <Button size="sm" variant="outline" onClick={() => publicationAction(item, 'draft')} disabled={busyKey !== null}>Brouillon</Button>
                          )}
                          {[...new Set([...item.missingRoles, ...item.replacementRoles])].map((role) => (
                            <Button key={role} size="sm" variant="outline" className="gap-1" onClick={() => autoAssign(item, role)} disabled={busyKey !== null}>
                              <Sparkles className="h-3.5 w-3.5" /> Auto-affecter {roleLabels[role]}
                            </Button>
                          ))}
                          {!!item.pending && item.planningStatus !== 'draft' && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => remind(item)} disabled={busyKey !== null}>
                              <Send className="h-3.5 w-3.5" /> Relancer
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3">
                <h3 className="text-lg font-semibold">Présences à clôturer</h3>
                <p className="text-sm text-muted-foreground">Affectations terminées depuis moins de 14 jours sans présence enregistrée.</p>
              </div>
              {!data.attendance.length ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Toutes les présences récentes sont renseignées.</CardContent></Card>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {data.attendance.slice(0, 12).map((item) => (
                    <Card key={`${item.eventId}:${item.role}:${item.personId ?? item.personNom}`}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div><p className="font-medium">{item.personNom}</p><p className="text-sm text-muted-foreground">{roleLabels[item.role]} · {item.title} · {item.date} {item.time}</p></div>
                          <Badge variant="outline">{item.assignmentStatus}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => attendance(item, 'present')} disabled={busyKey !== null}>Présent</Button>
                          <Button size="sm" variant="outline" onClick={() => attendance(item, 'excused')} disabled={busyKey !== null}>Excusé</Button>
                          <Button size="sm" variant="destructive" onClick={() => attendance(item, 'absent')} disabled={busyKey !== null}>Absent</Button>
                          <Button size="sm" variant="outline" onClick={() => attendance(item, 'replaced')} disabled={busyKey !== null}>Remplacé</Button>
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
                        <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{item.nom}</span><span className="text-muted-foreground">{item.upcoming} à venir · {item.last30Days} / 30j · {item.declined} refus · {item.absences} absence(s)</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (value / workloadMax) * 100)}%` }} /></div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Notifications récentes</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.recentNotifications.length ? data.recentNotifications.map((item) => (
                    <div key={item.id} className="border-b pb-2 last:border-0"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.message}</p></div>
                  )) : <p className="text-sm text-muted-foreground">Aucune notification récente.</p>}
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Activité récente</CardTitle></CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {data.recentAudit.map((item) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3"><span className="font-medium">{item.action}</span><Badge variant="outline">{item.entityType}</Badge></div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.userNom || item.userEmail || 'Système'} · {item.entityId}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground">Dernière analyse : {new Date(data.generatedAt).toLocaleString('fr-FR')}</p>
          </>
        ) : null}
      </main>
    </div>
  );
}
