'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Clock, History, LogOut, MapPin, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { toast } from 'sonner';
import type { PersonalPlanningEvent, PersonalPlanningResponse } from '@/types/auth';

type ViewMode = 'upcoming' | 'history';

const TYPE_LABELS: Record<PersonalPlanningEvent['type'], string> = {
  'match-officiel': 'Match officiel',
  'match-amical': 'Match amical',
  entrainement: 'Entraînement',
  plateau: 'Plateau',
};

function toDate(event: PersonalPlanningEvent): Date | null {
  const match = event.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const timeMatch = event.time.match(/^(\d{1,2}):(\d{2})$/);
  const hours = timeMatch ? Number(timeMatch[1]) : 0;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;
  const date = new Date(year, month - 1, day, hours, minutes);

  return Number.isNaN(date.getTime()) ? null : date;
}

function roleLabel(role: PersonalPlanningResponse['user']['role']): string {
  if (role === 'ARBITRE') return 'Arbitre';
  if (role === 'ENCADRANT') return 'Encadrant';
  return 'Accompagnateur';
}

export default function MyPlanningPage() {
  const router = useRouter();
  const [data, setData] = useState<PersonalPlanningResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('upcoming');

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/me/planning');
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Impossible de charger votre planning');
        }

        setData(payload);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Impossible de charger votre planning');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const { upcomingEvents, historyEvents } = useMemo(() => {
    const now = new Date();
    const events = data?.events ?? [];
    const upcoming: PersonalPlanningEvent[] = [];
    const history: PersonalPlanningEvent[] = [];

    for (const event of events) {
      const eventDate = toDate(event);
      if (!eventDate || eventDate >= now) {
        upcoming.push(event);
      } else {
        history.push(event);
      }
    }

    history.sort((a, b) => (toDate(b)?.getTime() ?? 0) - (toDate(a)?.getTime() ?? 0));

    return { upcomingEvents: upcoming, historyEvents: history };
  }, [data]);

  const displayedEvents = view === 'upcoming' ? upcomingEvents : historyEvents;

  const groupedEvents = useMemo(() => {
    return displayedEvents.reduce<Record<string, PersonalPlanningEvent[]>>((groups, event) => {
      groups[event.date] ??= [];
      groups[event.date]?.push(event);
      return groups;
    }, {});
  }, [displayedEvents]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } catch {
      toast.error('Erreur lors de la déconnexion');
    }
  };

  if (isLoading) {
    return <LoadingSpinner size={48} text="Chargement de votre planning..." className="min-h-screen py-20" />;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Card className="mx-auto mt-20 max-w-lg">
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">Votre planning n'est pas disponible.</p>
            <Button className="mt-4" onClick={() => router.refresh()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto flex items-center justify-between gap-4 px-3 py-4 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            {data.club.logo ? (
              <Image
                src={data.club.logo}
                alt={data.club.name}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full border object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CalendarDays className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">{data.club.name}</p>
              <p className="truncate text-xs text-muted-foreground">Mon planning</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => void handleLogout()} title="Déconnexion">
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Déconnexion</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">{data.user.displayName}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{data.user.email}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Badge>{roleLabel(data.user.role)}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Prochaines affectations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{upcomingEvents.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">{data.events.length} affectation(s) au total</p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-5 flex items-center gap-2">
          <Button
            variant={view === 'upcoming' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('upcoming')}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            À venir ({upcomingEvents.length})
          </Button>
          <Button
            variant={view === 'history' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('history')}
          >
            <History className="mr-2 h-4 w-4" />
            Historique ({historyEvents.length})
          </Button>
        </div>

        {displayedEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {view === 'upcoming'
                ? 'Aucune affectation à venir.'
                : 'Aucune affectation dans votre historique.'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-7">
            {Object.entries(groupedEvents).map(([date, events]) => (
              <section key={date}>
                <div className="mb-3 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold">{date}</h2>
                </div>

                <div className="grid gap-3">
                  {events.map((event) => (
                    <Card key={`${event.type}-${event.id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{TYPE_LABELS[event.type]}</Badge>
                              <Badge variant="outline">{event.roleLabel}</Badge>
                              {event.confirmed === true && <Badge>Confirmé</Badge>}
                            </div>
                            <h3 className="font-semibold text-foreground">{event.title}</h3>
                            {event.subtitle && (
                              <p className="mt-1 text-sm text-muted-foreground">{event.subtitle}</p>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-col gap-2 text-sm text-muted-foreground sm:items-end">
                            <span className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {event.time || 'Horaire à confirmer'}
                            </span>
                            {event.location && (
                              <span className="flex items-start gap-2 sm:max-w-xs sm:text-right">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                                {event.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
