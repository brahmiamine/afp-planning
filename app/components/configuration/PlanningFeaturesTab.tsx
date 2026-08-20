'use client';

import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPut } from '@/lib/utils/api';
import {
  DEFAULT_APP_SETTINGS,
  type PlanningFeatureFlags,
} from '@/lib/settings';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { Switch } from '@/app/components/ui/switch';

const FEATURES: Array<{
  key: keyof PlanningFeatureFlags;
  title: string;
  description: string;
}> = [
  { key: 'assignmentValidation', title: 'Validation des affectations', description: 'Bloque les indisponibilités, conflits et types de personnes incorrects.' },
  { key: 'publicationReadiness', title: 'Contrôle avant publication', description: 'Empêche la publication d’un planning incomplet ou invalide.' },
  { key: 'autoAssignment', title: 'Affectation automatique', description: 'Propose et affecte les personnes disponibles selon la charge.' },
  { key: 'automaticReminders', title: 'Relances automatiques', description: 'Envoie les relances liées aux affectations en attente.' },
  { key: 'assignmentSwaps', title: 'Échanges d’affectation', description: 'Autorise les demandes et validations de remplacement.' },
  { key: 'attendanceTracking', title: 'Suivi des présences', description: 'Permet de saisir présence, absence, excuse ou remplacement.' },
  { key: 'recurringEvents', title: 'Événements récurrents', description: 'Active la création et la modification des séries.' },
  { key: 'resourceBookings', title: 'Ressources et réservations', description: 'Active terrains, véhicules et conflits de réservation.' },
  { key: 'publicSharing', title: 'Partages publics', description: 'Autorise la création et la consultation des liens publics.' },
  { key: 'scraperSync', title: 'Synchronisation du scraper', description: 'Autorise l’import des matchs officiels vers MariaDB.' },
  { key: 'eventChat', title: 'Chat des événements', description: 'Autorise les salons liés aux événements du club.' },
  { key: 'travelAndWeather', title: 'Trajet et météo', description: 'Active les estimations de trajet et la météo événementielle.' },
  { key: 'calendarExport', title: 'Export calendrier', description: 'Autorise les flux iCalendar personnels.' },
  { key: 'collaboration', title: 'Collaboration', description: 'Active commentaires, tâches et comptes rendus du planning.' },
  { key: 'superadminPublicationApproval', title: 'Approbation Super Admin', description: 'Réserve la publication finale des plannings au Super Admin.' },
];

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
        <CardDescription>Ces interrupteurs sont réservés au Super Admin et sont appliqués côté serveur.</CardDescription>
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
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left"><tr><th className="p-3">Date</th><th className="p-3">État</th><th className="p-3">Actifs</th><th className="p-3">Créés</th><th className="p-3">Modifiés</th><th className="p-3">Absents</th></tr></thead>
                <tbody>{scraperRuns.map((run) => (
                  <tr key={run.id} className="border-t" title={run.errorMessage ?? undefined}>
                    <td className="p-3 whitespace-nowrap">{new Date(run.startedAt).toLocaleString('fr-FR')}</td>
                    <td className="p-3">{run.status === 'succeeded' ? 'Réussie' : run.status === 'failed' ? 'Échec' : 'En cours'}</td>
                    <td className="p-3">{run.activeCount ?? '—'}</td><td className="p-3">{run.createdCount ?? '—'}</td><td className="p-3">{run.updatedCount ?? '—'}</td><td className="p-3">{run.missingCount ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex justify-end"><Button onClick={save} disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button></div>
      </CardContent>
    </Card>
  );
}
