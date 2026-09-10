'use client';

import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPut } from '@/lib/utils/api';
import {
  DEFAULT_APP_SETTINGS,
  type PlanningFeatureFlags,
} from '@/lib/settings';
import { PLANNING_FEATURE_SURFACES } from '@/lib/planning/feature-surfaces';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { DataCell, DataList, DataRow, StatusPill } from '@/app/components/layout/page-primitives';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { Switch } from '@/app/components/ui/switch';

// Registre unique (issue #279) : chaque flag de PlanningFeatureFlags apparaît ici
// automatiquement — PLANNING_FEATURE_SURFACES est un Record exhaustif sur ce type,
// donc un nouveau flag sans entrée dans le registre est une erreur de compilation,
// jamais un oubli silencieux dans cette interface.
const FEATURES: Array<{
  key: keyof PlanningFeatureFlags;
  title: string;
  description: string;
}> = (Object.keys(PLANNING_FEATURE_SURFACES) as Array<keyof PlanningFeatureFlags>).map((key) => ({
  key,
  title: PLANNING_FEATURE_SURFACES[key].label,
  description: PLANNING_FEATURE_SURFACES[key].description,
}));

interface FeatureSettingsResponse {
  features: PlanningFeatureFlags;
  timeZone: string;
}

interface ScraperRun {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  activeCount: number | null;
  createdCount: number | null;
  updatedCount: number | null;
  missingCount: number | null;
  errorMessage: string | null;
}

export function PlanningFeaturesTab() {
  const [features, setFeatures] = useState(DEFAULT_APP_SETTINGS.features);
  const [timeZone, setTimeZone] = useState(DEFAULT_APP_SETTINGS.timeZone);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [scraperRuns, setScraperRuns] = useState<ScraperRun[]>([]);

  useEffect(() => {
    void apiGet<FeatureSettingsResponse>('/api/settings/planning-features')
      .then((response) => {
        setFeatures(response.features);
        setTimeZone(response.timeZone);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Chargement impossible'))
      .finally(() => setIsLoading(false));
    void apiGet<{ runs: ScraperRun[] }>('/api/scraper')
      .then((response) => setScraperRuns(response.runs.slice(0, 8)))
      .catch(() => setScraperRuns([]));
  }, []);

  const save = async () => {
    try {
      setIsSaving(true);
      const response = await apiPut<FeatureSettingsResponse & { success: boolean }>(
        '/api/settings/planning-features',
        { features, timeZone },
      );
      setFeatures(response.features);
      setTimeZone(response.timeZone);
      toast.success('Fonctionnalités enregistrées');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner size={40} text="Chargement..." className="py-20" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Fonctionnalités du planning</CardTitle>
        <CardDescription>Ces interrupteurs sont réservés aux administrateurs du club et sont appliqués côté serveur.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 max-w-md">
          <Label htmlFor="planning-time-zone">Fuseau horaire du club</Label>
          <Input id="planning-time-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Europe/Paris" />
          <p className="text-xs text-muted-foreground">Nom IANA utilisé pour les futurs calculs et exports, par exemple Europe/Paris.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.key} className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor={`feature-${feature.key}`} className="font-medium">{feature.title}</Label>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <Switch
                id={`feature-${feature.key}`}
                checked={features[feature.key]}
                onCheckedChange={(checked) => setFeatures((current) => ({ ...current, [feature.key]: checked }))}
                aria-label={feature.title}
              />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <h3 className="font-medium">Dernières synchronisations du scraper</h3>
            <p className="text-xs text-muted-foreground">Historique stocké dans MariaDB, sans fichier JSON intermédiaire.</p>
          </div>
          {scraperRuns.length === 0 ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">Aucune exécution enregistrée.</p>
          ) : (
            <DataList
              columns="minmax(0,1.4fr) auto auto auto auto auto"
              header={
                <>
                  <span>Date</span>
                  <span>État</span>
                  <span>Actifs</span>
                  <span>Créés</span>
                  <span>Modifiés</span>
                  <span>Absents</span>
                </>
              }
            >
              {scraperRuns.map((run) => (
                <DataRow key={run.id} columns="minmax(0,1.4fr) auto auto auto auto auto" className="text-sm">
                  <DataCell label="Date" className="whitespace-nowrap">
                    {new Date(run.startedAt).toLocaleString('fr-FR')}
                  </DataCell>
                  <DataCell label="État">
                    <StatusPill
                      tone={run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'danger' : 'pending'}
                    >
                      {run.status === 'succeeded' ? 'Réussie' : run.status === 'failed' ? 'Échec' : 'En cours'}
                    </StatusPill>
                  </DataCell>
                  <DataCell label="Actifs">{run.activeCount ?? '—'}</DataCell>
                  <DataCell label="Créés">{run.createdCount ?? '—'}</DataCell>
                  <DataCell label="Modifiés">{run.updatedCount ?? '—'}</DataCell>
                  <DataCell label="Absents">{run.missingCount ?? '—'}</DataCell>
                </DataRow>
              ))}
            </DataList>
          )}
        </div>
        <div className="flex justify-end"><Button onClick={save} disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button></div>
      </CardContent>
    </Card>
  );
}
