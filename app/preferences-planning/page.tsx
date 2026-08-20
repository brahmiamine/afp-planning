'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/app/components/layout/Header';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { apiGet, apiPut } from '@/lib/utils/api';
import { toast } from 'sonner';

interface Preferences {
  preferredCategories: string[];
  preferredWeekdays: number[];
  preferredTimeRanges: Array<{ start: string; end: string }>;
  preferredLocations: string[];
  maxAssignmentsPerWeek: number | null;
  maxTravelMinutes: number | null;
}

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function PlanningPreferencesPage() {
  const { user, isLoading } = useCurrentUser();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [categories, setCategories] = useState('');
  const [locations, setLocations] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiGet<{ preferences: Preferences }>('/api/me/planning-preferences');
      setPreferences(result.preferences);
      setCategories(result.preferences.preferredCategories.join(', '));
      setLocations(result.preferences.preferredLocations.join(', '));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger vos préférences');
    }
  }, []);

  useEffect(() => { if (user) void load(); }, [user, load]);

  if (isLoading || !user || !preferences) {
    return <LoadingSpinner size={44} text="Chargement..." className="min-h-screen" />;
  }

  const toggleDay = (day: number) => {
    setPreferences((current) => current ? {
      ...current,
      preferredWeekdays: current.preferredWeekdays.includes(day)
        ? current.preferredWeekdays.filter((item) => item !== day)
        : [...current.preferredWeekdays, day],
    } : current);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Preferences = {
        ...preferences,
        preferredCategories: categories.split(',').map((item) => item.trim()).filter(Boolean),
        preferredLocations: locations.split(',').map((item) => item.trim()).filter(Boolean),
      };
      const result = await apiPut<{ preferences: Preferences }>('/api/me/planning-preferences', payload);
      setPreferences(result.preferences);
      toast.success('Préférences enregistrées');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => undefined} />
      <main className="container mx-auto max-w-3xl space-y-5 px-3 py-6 sm:px-4">
        <div>
          <h2 className="text-2xl font-bold">Préférences de planning</h2>
          <p className="text-sm text-muted-foreground">Ces préférences améliorent le classement des propositions d’affectation. Les indisponibilités restent prioritaires.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Catégories et lieux préférés</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-sm font-medium">Catégories, séparées par des virgules
              <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={categories} onChange={(event) => setCategories(event.target.value)} placeholder="U13, U15, Seniors" />
            </label>
            <label className="block text-sm font-medium">Lieux préférés, séparés par des virgules
              <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Poissonniers, Dauvin" />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Jours préférés</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, day) => (
              <Button key={label} type="button" variant={preferences.preferredWeekdays.includes(day) ? 'default' : 'outline'} onClick={() => toggleDay(day)}>
                {label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Limites de charge</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Maximum d’affectations / semaine
              <input type="number" min={1} max={20} className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={preferences.maxAssignmentsPerWeek ?? ''} onChange={(event) => setPreferences({ ...preferences, maxAssignmentsPerWeek: event.target.value ? Number(event.target.value) : null })} />
            </label>
            <label className="text-sm font-medium">Trajet maximum souhaité (minutes)
              <input type="number" min={5} max={360} className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={preferences.maxTravelMinutes ?? ''} onChange={(event) => setPreferences({ ...preferences, maxTravelMinutes: event.target.value ? Number(event.target.value) : null })} />
            </label>
          </CardContent>
        </Card>

        <Button onClick={save} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer mes préférences'}</Button>
      </main>
    </div>
  );
}
