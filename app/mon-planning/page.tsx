'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, History, MapPin, X } from 'lucide-react';
import { Header } from '@/app/components/layout/Header';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

type AssignmentStatus = 'pending' | 'accepted' | 'declined';
type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';

interface PersonalAssignment {
  assignmentId: string;
  eventId: string;
  eventType: EventType;
  role: 'arbitre' | 'encadrant' | 'accompagnateur';
  status: AssignmentStatus;
  respondedAt: string | null;
  date: string;
  time: string;
  durationMinutes: number;
  title: string;
  categorie: string | null;
  lieu: string | null;
  adresse: string | null;
  itineraryLink: string | null;
  rendezVous: string | null;
  seriesId: string | null;
  confirmed: boolean | null;
}

interface PlanningStats {
  total: number;
  upcoming: number;
  past: number;
  pending: number;
  accepted: number;
  declined: number;
  officiel: number;
  amical: number;
  entrainement: number;
  plateau: number;
}

interface PlanningResponse {
  assignments: PersonalAssignment[];
  stats: PlanningStats;
}

function eventTimestamp(item: PersonalAssignment): number {
  const [day, month, year] = item.date.split('/').map((value) => Number.parseInt(value, 10));
  const [hour, minute] = item.time.replace('h', ':').split(':').map((value) => Number.parseInt(value, 10));
  if (!day || !month || !year) return 0;
  return new Date(year, month - 1, day, hour || 0, minute || 0).getTime();
}

function statusBadge(status: AssignmentStatus) {
  if (status === 'accepted') return <Badge className="bg-emerald-600 hover:bg-emerald-600">Acceptée</Badge>;
  if (status === 'declined') return <Badge variant="destructive">Refusée</Badge>;
  return <Badge variant="secondary">En attente</Badge>;
}

function typeLabel(type: EventType): string {
  if (type === 'officiel') return 'Match officiel';
  if (type === 'amical') return 'Match amical';
  if (type === 'entrainement') return 'Entraînement';
  return 'Plateau';
}

export default function MonPlanningPage() {
  const [data, setData] = useState<PlanningResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<PlanningResponse>('/api/me/planning'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger votre planning');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { upcoming, history } = useMemo(() => {
    const now = Date.now();
    const all = data?.assignments ?? [];
    return {
      upcoming: all.filter((item) => eventTimestamp(item) + item.durationMinutes * 60_000 >= now),
      history: all.filter((item) => eventTimestamp(item) + item.durationMinutes * 60_000 < now).reverse(),
    };
  }, [data]);

  const respond = async (item: PersonalAssignment, status: 'accepted' | 'declined') => {
    setResponding(item.assignmentId);
    try {
      await apiPost('/api/me/assignments/respond', {
        eventId: item.eventId,
        eventType: item.eventType,
        status,
      });
      toast.success(status === 'accepted' ? 'Affectation acceptée' : 'Affectation refusée');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d’enregistrer votre réponse');
    } finally {
      setResponding(null);
    }
  };

  const renderAssignment = (item: PersonalAssignment) => (
    <Card key={item.assignmentId}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{typeLabel(item.eventType)}</Badge>
              {statusBadge(item.status)}
            </div>
            <CardTitle className="text-lg">{item.title}</CardTitle>
            <CardDescription>{item.categorie || 'Sans catégorie'}</CardDescription>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{item.date}</p>
            <p className="text-muted-foreground">{item.time}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {item.rendezVous && (
            <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-muted-foreground" /> RDV {item.rendezVous}</p>
          )}
          {item.lieu && (
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {item.lieu}</p>
          )}
          {item.adresse && <p className="text-muted-foreground sm:col-span-2">{item.adresse}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {item.itineraryLink && (
            <Button variant="outline" size="sm" asChild>
              <a href={item.itineraryLink} target="_blank" rel="noreferrer">Itinéraire</a>
            </Button>
          )}
          {item.status !== 'accepted' && (
            <Button size="sm" onClick={() => respond(item, 'accepted')} disabled={responding === item.assignmentId}>
              <Check className="mr-2 h-4 w-4" /> Accepter
            </Button>
          )}
          {item.status !== 'declined' && (
            <Button variant="destructive" size="sm" onClick={() => respond(item, 'declined')} disabled={responding === item.assignmentId}>
              <X className="mr-2 h-4 w-4" /> Refuser
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto px-3 py-5 sm:px-4 sm:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="h-6 w-6" /> Mon planning</h2>
            <p className="text-sm text-muted-foreground">Uniquement vos affectations et votre historique.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/mes-indisponibilites">Mes indisponibilités</Link></Button>
            <Button variant="outline" asChild><Link href="/profil">Mon profil</Link></Button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner size={44} text="Chargement de votre planning..." className="py-20" />
        ) : !data ? null : (
          <>
            <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {[
                ['À venir', data.stats.upcoming],
                ['Historique', data.stats.past],
                ['En attente', data.stats.pending],
                ['Acceptées', data.stats.accepted],
                ['Refusées', data.stats.declined],
                ['Total', data.stats.total],
              ].map(([label, value]) => (
                <Card key={String(label)}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <section className="mb-8">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold"><CalendarDays className="h-5 w-5" /> Prochaines affectations</h3>
              {upcoming.length ? <div className="grid gap-3 lg:grid-cols-2">{upcoming.map(renderAssignment)}</div> : (
                <Card><CardContent className="py-10 text-center text-muted-foreground">Aucune affectation à venir.</CardContent></Card>
              )}
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5" /> Historique</h3>
              {history.length ? <div className="grid gap-3 lg:grid-cols-2">{history.map(renderAssignment)}</div> : (
                <Card><CardContent className="py-10 text-center text-muted-foreground">Aucun historique pour le moment.</CardContent></Card>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
