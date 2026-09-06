'use client';

import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';
import { toast } from 'sonner';

interface HistoryItem {
  id: number;
  title: string;
  actor: string;
  createdAt: string;
}

export default function PlanningHistoriquePage() {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { history } = await apiGet<{ history: HistoryItem[] }>('/api/planning/historique');
      setHistory(history);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger l\'historique');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold"><History className="h-6 w-6" /> Historique lisible</h2>
        <p className="text-sm text-muted-foreground">Les 100 dernières actions effectuées sur le planning.</p>
      </div>

      {loading ? (
        <LoadingSpinner size={44} text="Chargement de l'historique..." className="py-20" />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Actions récentes</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {history?.length ? history.map((item) => (
              <div key={item.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.actor} · {new Date(item.createdAt).toLocaleString('fr-FR')}</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">Aucun historique disponible.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
