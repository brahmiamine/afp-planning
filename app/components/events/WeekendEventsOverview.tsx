'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';
import { eventWorkspaceHref, type PlanningEventLinkType } from '@/lib/planning/event-links';

interface WeekendItem {
  eventId: string;
  eventType: PlanningEventLinkType;
  title: string;
  date: string;
  time: string;
  location: string | null;
  planningStatus: 'draft' | 'published' | 'modified' | 'cancelled';
  readiness: 'ready' | 'attention';
  missingRoles: string[];
  replacementRoles: string[];
  pending: number;
  declined: number;
}

interface WeekendData {
  start: string;
  end: string;
  total: number;
  ready: number;
  attention: number;
  items: WeekendItem[];
}

interface WeekendEventsOverviewProps {
  refreshKey?: number;
}

function formatWeekendDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(parsed);
}

function statusLabel(status: WeekendItem['planningStatus']): string {
  if (status === 'draft') return 'Brouillon';
  if (status === 'modified') return 'Modifié';
  if (status === 'cancelled') return 'Annulé';
  return 'Publié';
}

export function WeekendEventsOverview({ refreshKey = 0 }: WeekendEventsOverviewProps) {
  const [data, setData] = useState<WeekendData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await apiGet<WeekendData>('/api/planning/weekend'));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger le pilotage du week-end');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section id="week-end" className="scroll-mt-24 space-y-4" aria-labelledby="weekend-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="weekend-heading" className="text-lg font-bold sm:text-xl">Pilotage du week-end</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Couverture des rôles, réponses attendues et événements à finaliser avant le week-end.
          </p>
        </div>
        {data && (
          <Badge variant="outline" className="w-fit">
            {formatWeekendDate(data.start)} → {formatWeekendDate(data.end)}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <LoadingSpinner size={36} text="Préparation du week-end..." />
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Pilotage du week-end indisponible</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Événements ce week-end</p>
                <p className="mt-1 text-2xl font-bold">{data.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Prêts</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">{data.ready}</p>
                  </div>
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">À traiter</p>
                    <p className="mt-1 text-2xl font-bold text-destructive">{data.attention}</p>
                  </div>
                  <TriangleAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            {data.items.map((item) => (
              <Card key={`${item.eventType}:${item.eventId}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{item.title}</CardTitle>
                        <Badge variant="outline">{statusLabel(item.planningStatus)}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-4 w-4" aria-hidden="true" /> {item.date}
                        </span>
                        {item.time && (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-4 w-4" aria-hidden="true" /> {item.time}
                          </span>
                        )}
                        {item.location && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" aria-hidden="true" /> {item.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={item.readiness === 'ready' ? 'outline' : 'destructive'} className="w-fit">
                      {item.readiness === 'ready' ? 'Prêt' : 'À traiter'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.missingRoles.map((role) => (
                      <Badge variant="destructive" key={`missing-${role}`}>Manque {role}</Badge>
                    ))}
                    {item.replacementRoles.map((role) => (
                      <Badge variant="destructive" key={`replacement-${role}`}>Remplacer {role}</Badge>
                    ))}
                    {!!item.pending && <Badge variant="secondary">{item.pending} réponse(s) en attente</Badge>}
                    {!!item.declined && <Badge variant="destructive">{item.declined} refus</Badge>}
                    {item.readiness === 'ready' && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Couverture complète
                      </span>
                    )}
                    {item.readiness === 'attention'
                      && !item.missingRoles.length
                      && !item.replacementRoles.length
                      && !item.pending
                      && !item.declined && (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Publication à finaliser
                        </span>
                      )}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={eventWorkspaceHref(item.eventType, item.eventId)}>
                      Ouvrir l’espace événement <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
            {!data.items.length && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Aucun événement prévu ce week-end.
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
