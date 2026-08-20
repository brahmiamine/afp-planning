'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, UserX } from 'lucide-react';
import { Header } from '@/app/components/layout/Header';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';
import { toast } from 'sonner';

interface OverviewItem {
  eventId: string;
  eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau';
  title: string;
  date: string;
  time: string;
  missingRoles: string[];
  pending: number;
  declined: number;
}

interface OverviewResponse {
  totals: {
    events: number;
    complete: number;
    attention: number;
    missingRoles: number;
    pending: number;
    declined: number;
  };
  items: OverviewItem[];
}

export default function PlanningControlePage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<OverviewResponse>('/api/planning/overview'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de contrôler le planning');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={load} />
      <main className="container mx-auto px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold"><AlertTriangle className="h-6 w-6" /> Contrôle du planning</h2>
          <p className="text-sm text-muted-foreground">Événements incomplets, réponses en attente et refus d’affectation.</p>
        </div>

        {loading ? <LoadingSpinner size={44} text="Analyse du planning..." className="py-20" /> : data && (
          <>
            <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {[
                ['Événements', data.totals.events],
                ['Complets', data.totals.complete],
                ['À traiter', data.totals.attention],
                ['Rôles manquants', data.totals.missingRoles],
                ['En attente', data.totals.pending],
                ['Refus', data.totals.declined],
              ].map(([label, value]) => (
                <Card key={String(label)}>
                  <CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent>
                </Card>
              ))}
            </div>

            {!data.items.length ? (
              <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-emerald-600"><CheckCircle2 className="h-5 w-5" /> Le planning est complet.</CardContent></Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.items.map((item) => (
                  <Card key={`${item.eventType}:${item.eventId}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div><CardTitle className="text-base">{item.title}</CardTitle><p className="text-sm text-muted-foreground">{item.date} · {item.time}</p></div>
                        <Badge variant="outline">{item.eventType}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {!!item.missingRoles.length && <p className="flex items-center gap-2 text-sm text-destructive"><UserX className="h-4 w-4" /> Manque : {item.missingRoles.join(', ')}</p>}
                      {!!item.pending && <p className="flex items-center gap-2 text-sm text-amber-700"><Clock3 className="h-4 w-4" /> {item.pending} réponse(s) en attente</p>}
                      {!!item.declined && <p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" /> {item.declined} affectation(s) refusée(s)</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
