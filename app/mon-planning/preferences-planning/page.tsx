'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/app/components/layout/Header';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { PageHeader, SectionCard } from '@/app/components/layout/page-primitives';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { PLANNING_FUNCTION_LABELS, type PlanningFunction } from '@/lib/auth/roles';
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
  const [selectedFunction, setSelectedFunction] = useState<PlanningFunction | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [categories, setCategories] = useState('');
  const [locations, setLocations] = useState('');
  const [saving, setSaving] = useState(false);

  // Une fonction terrain à la fois : les préférences (charge, catégories, créneaux…) sont
  // propres à chaque fonction cumulée par le dirigeant (issue #202), contrairement aux
  // indisponibilités personnelles qui restent communes.
  const load = useCallback(async (planningFunction: PlanningFunction) => {
    try {
      const result = await apiGet<{ preferences: Preferences }>(`/api/me/planning-preferences?function=${planningFunction}`);
      setPreferences(result.preferences);
      setCategories(result.preferences.preferredCategories.join(', '));
      setLocations(result.preferences.preferredLocations.join(', '));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger vos préférences');
    }
  }, []);

  useEffect(() => {
    if (!user?.planningFunctions.length) return;
    const initial = user.planningFunctions[0]!;
    setSelectedFunction(initial);
    void load(initial);
    // Une seule fois au chargement de l'utilisateur : les changements de fonction sont
    // gérés explicitement par selectFunction ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const selectFunction = (planningFunction: PlanningFunction) => {
    setSelectedFunction(planningFunction);
    setPreferences(null);
    void load(planningFunction);
  };

  if (isLoading || !user || !selectedFunction || !preferences) {
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
      const payload = {
        ...preferences,
        function: selectedFunction,
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
        <PageHeader
          icon={<SlidersHorizontal />}
          title="Préférences de planning"
          description="Ces préférences améliorent le classement des propositions d’affectation. Les indisponibilités restent prioritaires."
        />

        {user.planningFunctions.length > 1 && (
          <SectionCard title="Fonction" contentClassName="flex flex-wrap gap-2">
            {user.planningFunctions.map((fn) => (
              <Button key={fn} type="button" variant={selectedFunction === fn ? 'default' : 'outline'} onClick={() => selectFunction(fn)}>
                {PLANNING_FUNCTION_LABELS[fn]}
              </Button>
            ))}
          </SectionCard>
        )}

        <SectionCard title="Catégories et lieux préférés" contentClassName="space-y-4">
            <label className="block text-sm font-medium">Catégories, séparées par des virgules
              <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={categories} onChange={(event) => setCategories(event.target.value)} placeholder="U13, U15, Seniors" />
            </label>
            <label className="block text-sm font-medium">Lieux préférés, séparés par des virgules
              <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="Poissonniers, Dauvin" />
            </label>
        </SectionCard>

        <SectionCard title="Jours préférés" contentClassName="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, day) => (
              <Button key={label} type="button" variant={preferences.preferredWeekdays.includes(day) ? 'default' : 'outline'} onClick={() => toggleDay(day)}>
                {label}
              </Button>
            ))}
        </SectionCard>

        <SectionCard title="Limites de charge" contentClassName="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Maximum d’affectations / semaine
              <input type="number" min={1} max={20} className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={preferences.maxAssignmentsPerWeek ?? ''} onChange={(event) => setPreferences({ ...preferences, maxAssignmentsPerWeek: event.target.value ? Number(event.target.value) : null })} />
            </label>
            <label className="text-sm font-medium">Trajet maximum souhaité (minutes)
              <input type="number" min={5} max={360} className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={preferences.maxTravelMinutes ?? ''} onChange={(event) => setPreferences({ ...preferences, maxTravelMinutes: event.target.value ? Number(event.target.value) : null })} />
            </label>
        </SectionCard>

        <Button onClick={save} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer mes préférences'}</Button>
      </main>
    </div>
  );
}
