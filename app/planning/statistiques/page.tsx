'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Scale } from 'lucide-react';
import { Header } from '@/app/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';
import { toast } from 'sonner';

interface Analytics {
  events: number;
  requiredRoles: number;
  missingRoles: number;
  assignments: number;
  respondedAssignments: number;
  acceptanceRate: number;
  attendanceRate: number;
  averageResponseDelayMinutes: number | null;
  replacementRate: number;
  missingCoverageRate: number;
  fairnessCoefficient: number;
  workload: Array<{
    identity: string;
    nom: string;
    assignments: number;
    accepted: number;
    declined: number;
    present: number;
    absent: number;
  }>;
}

export default function PlanningStatisticsPage() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    apiGet<Analytics>('/api/planning/analytics')
      .then(setData)
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Impossible de charger les statistiques'));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto space-y-6 px-3 py-6 sm:px-4 sm:py-8">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 className="h-6 w-6" /> Statistiques planning</h2>
          <p className="text-sm text-muted-foreground">Acceptation, présence, délais, couverture et équité de charge.</p>
        </div>
        {!data ? <LoadingSpinner size={44} text="Calcul des statistiques..." className="py-20" /> : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Acceptation', `${data.acceptanceRate.toFixed(1)} %`],
                ['Présence', `${data.attendanceRate.toFixed(1)} %`],
                ['Remplacements', `${data.replacementRate.toFixed(1)} %`],
                ['Couverture manquante', `${data.missingCoverageRate.toFixed(1)} %`],
                ['Délai moyen', data.averageResponseDelayMinutes === null ? '—' : `${Math.round(data.averageResponseDelayMinutes)} min`],
                ['Affectations', data.assignments],
                ['Événements', data.events],
                ['Équité', `${Math.round(data.fairnessCoefficient * 100)} / 100`],
              ].map(([label, value]) => (
                <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{String(value)}</p></CardContent></Card>
              ))}
            </section>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" /> Répartition de la charge</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.workload.length === 0 ? <p className="text-sm text-muted-foreground">Aucune affectation disponible.</p> : data.workload.map((item) => (
                  <div key={item.identity} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                    <strong>{item.nom}</strong>
                    <span>{item.assignments} affectation(s)</span>
                    <span className="text-muted-foreground">{item.accepted} acceptée(s)</span>
                    <span className="text-muted-foreground">{item.declined} refus</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
