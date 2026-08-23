'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, TriangleAlert } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';
import { toast } from 'sonner';

interface WeekendItem {
  eventId: string;
  eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau';
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

export default function WeekendPlanningPage() {
  const [data, setData] = useState<WeekendData | null>(null);

  useEffect(() => {
    apiGet<WeekendData>('/api/planning/weekend')
      .then(setData)
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Impossible de charger le week-end'));
  }, []);

  return (
    <div className="space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="h-6 w-6" /> Planning du week-end</h2>
          <p className="text-sm text-muted-foreground">Lecture chronologique avec couverture des rôles et réponses attendues.</p>
        </div>
        {!data ? <LoadingSpinner size={44} text="Préparation du week-end..." className="py-20" /> : (
          <>
            <section className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Événements</p><p className="text-2xl font-bold">{data.total}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Prêts</p><p className="text-2xl font-bold text-emerald-600">{data.ready}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">À traiter</p><p className="text-2xl font-bold text-destructive">{data.attention}</p></CardContent></Card>
            </section>
            <div className="space-y-3">
              {data.items.map((item) => (
                <Card key={`${item.eventType}:${item.eventId}`}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><CardTitle className="text-base">{item.title}</CardTitle><p className="text-sm text-muted-foreground">{item.date} · {item.time}{item.location ? ` · ${item.location}` : ''}</p></div>
                      <Badge variant={item.readiness === 'ready' ? 'outline' : 'destructive'}>{item.readiness === 'ready' ? 'Prêt' : 'À traiter'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {item.missingRoles.map((role) => <Badge variant="destructive" key={`m-${role}`}>Manque {role}</Badge>)}
                      {item.replacementRoles.map((role) => <Badge variant="destructive" key={`r-${role}`}>Remplacer {role}</Badge>)}
                      {!!item.pending && <Badge variant="secondary">{item.pending} réponse(s) en attente</Badge>}
                      {!!item.declined && <Badge variant="destructive">{item.declined} refus</Badge>}
                      {item.readiness === 'ready' && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Couverture complète</span>}
                      {item.readiness === 'attention' && !item.missingRoles.length && !item.replacementRoles.length && !item.pending && !item.declined && <span className="flex items-center gap-1 text-amber-600"><TriangleAlert className="h-4 w-4" /> Publication à finaliser</span>}
                    </div>
                    <Button variant="outline" size="sm" asChild><Link href={`/club/planning/evenement/${item.eventType}/${encodeURIComponent(item.eventId)}`}>Ouvrir l’espace événement</Link></Button>
                  </CardContent>
                </Card>
              ))}
              {!data.items.length && <Card><CardContent className="py-10 text-center text-muted-foreground">Aucun événement prévu ce week-end.</CardContent></Card>}
            </div>
          </>
        )}
    </div>
  );
}
