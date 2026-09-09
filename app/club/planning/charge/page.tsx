'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, CalendarClock, ThumbsDown, Users } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { PageContainer, PageHeader } from '@/app/components/layout/page-primitives';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';
import { toast } from 'sonner';
import type { PersonType } from '@/types/match';
import { useAppSettings } from '@/app/hooks/useAppSettings';
import { roleLabelWithClub } from '@/lib/settings';

interface WorkloadEntry {
  nom: string;
  personType: PersonType;
  total: number;
  upcoming: number;
  declined: number;
}

interface WorkloadResponse {
  entries: WorkloadEntry[];
}

const PERSON_TYPE_BASE_LABELS: Record<PersonType, string> = {
  officiel: 'Arbitre',
  encadrant: 'Encadrant',
  accompagnateur: 'Accompagnateur',
};

export default function PlanningChargePage() {
  const [data, setData] = useState<WorkloadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useAppSettings();

  const load = useCallback(async () => {
    try {
      setData(await apiGet<WorkloadResponse>('/api/planning/workload'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de calculer la charge des officiels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxTotal = data ? Math.max(1, ...data.entries.map((entry) => entry.total)) : 1;

  return (
    <PageContainer>
        <PageHeader
          icon={<BarChart3 />}
          title="Charge des officiels"
          description="Répartition des affectations par personne, toutes périodes confondues."
        />

        {loading ? (
          <LoadingSpinner size={44} text="Calcul de la charge..." className="py-20" />
        ) : !data || data.entries.length === 0 ? (
          <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Users className="h-5 w-5" /> Aucune affectation enregistrée.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {data.entries.map((entry) => (
              <Card key={`${entry.personType}:${entry.nom}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{entry.nom}</CardTitle>
                    <Badge variant="outline">{roleLabelWithClub(PERSON_TYPE_BASE_LABELS[entry.personType], settings.clubAbbreviation)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(entry.total / maxTotal) * 100}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{entry.total} affectation{entry.total > 1 ? 's' : ''}</span>
                    {!!entry.upcoming && (
                      <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {entry.upcoming} à venir</span>
                    )}
                    {!!entry.declined && (
                      <span className="flex items-center gap-1 text-destructive"><ThumbsDown className="h-3.5 w-3.5" /> {entry.declined} refus</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </PageContainer>
  );
}
