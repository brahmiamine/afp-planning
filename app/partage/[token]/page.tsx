'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CalendarDays, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';

interface PublicItem {
  eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau';
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  location: string | null;
  category: string | null;
}

export default function PublicPlanningSharePage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<{ expiresAt: string; items: PublicItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.token) return;
    apiGet<{ expiresAt: string; items: PublicItem[] }>(`/api/public/planning/${encodeURIComponent(params.token)}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Lien indisponible'));
  }, [params.token]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-6 bg-background px-4 py-8 text-foreground">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="h-6 w-6" /> Planning partagé</h1>
        <p className="text-sm text-muted-foreground">Vue publique en lecture seule. Aucune donnée personnelle des affectés n’est affichée.</p>
      </div>
      {error ? <Card><CardContent className="py-10 text-center text-destructive">{error}</CardContent></Card> : !data ? <LoadingSpinner size={44} text="Chargement du planning..." className="py-20" /> : (
        <>
          <p className="text-xs text-muted-foreground">Lien valable jusqu’au {new Date(data.expiresAt).toLocaleString('fr-FR')}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {data.items.map((item, index) => (
              <Card key={`${item.eventType}:${item.date}:${item.time}:${index}`}>
                <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{item.title}</CardTitle><Badge variant="outline">{item.eventType}</Badge></div></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><strong>{item.date}</strong> · {item.time} · {item.durationMinutes} min</p>
                  {item.category && <p className="text-muted-foreground">{item.category}</p>}
                  {item.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {item.location}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
          {!data.items.length && <Card><CardContent className="py-10 text-center text-muted-foreground">Aucun événement dans cette période.</CardContent></Card>}
        </>
      )}
    </main>
  );
}
