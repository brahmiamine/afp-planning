'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet, apiPut } from '@/lib/utils/api';
import { toast } from 'sonner';

interface Preferences {
  inApp: boolean;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  urgencyThreshold: 'normal' | 'important' | 'critical';
  eventTypes: string[];
}

const EVENT_TYPES = [
  ['officiel', 'Match officiel'],
  ['amical', 'Match amical'],
  ['entrainement', 'Entraînement'],
  ['plateau', 'Plateau'],
] as const;

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ preferences: Preferences }>('/api/me/notification-preferences');
      setPreferences(data.preferences);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Chargement impossible'); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  if (!preferences) return <LoadingSpinner size={44} text="Chargement..." className="min-h-screen" />;

  const toggleEvent = (type: string) => setPreferences((current) => current ? {
    ...current,
    eventTypes: current.eventTypes.includes(type) ? current.eventTypes.filter((item) => item !== type) : [...current.eventTypes, type],
  } : current);

  const save = async () => {
    setSaving(true);
    try {
      const result = await apiPut<{ preferences: Preferences }>('/api/me/notification-preferences', preferences);
      setPreferences(result.preferences);
      toast.success('Préférences de notification enregistrées');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Enregistrement impossible'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl space-y-6">
        <div><h2 className="text-2xl font-bold">Notifications</h2><p className="text-sm text-muted-foreground">Choisissez les canaux secondaires. WhatsApp nécessite une intégration serveur configurée par l’administrateur.</p></div>
        <Card><CardHeader><CardTitle className="text-base">Canaux</CardTitle></CardHeader><CardContent className="space-y-3">
          {([
            ['inApp', 'Dans l’application'], ['push', 'Push PWA / smartphone'], ['email', 'Email'], ['whatsapp', 'WhatsApp'],
          ] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-md border p-3"><span>{label}</span><input type="checkbox" checked={preferences[key]} disabled={key === 'push' && !preferences.inApp} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} /></label>)}
          {!preferences.inApp && <p className="text-xs text-muted-foreground">Le push PWA utilise la notification in-app comme source durable ; désactiver l’in-app désactive donc automatiquement le push.</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Niveau minimum pour les canaux secondaires</CardTitle></CardHeader><CardContent><select className="w-full rounded-md border bg-background px-3 py-2" value={preferences.urgencyThreshold} onChange={(event) => setPreferences({ ...preferences, urgencyThreshold: event.target.value as Preferences['urgencyThreshold'] })}><option value="normal">Toutes les notifications</option><option value="important">Importantes et critiques</option><option value="critical">Critiques uniquement</option></select></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Types d’événements</CardTitle></CardHeader><CardContent><p className="mb-3 text-xs text-muted-foreground">Aucune sélection = tous les événements. Ce filtre s’applique aux canaux email/push/WhatsApp ; l’in-app reste votre historique.</p><div className="flex flex-wrap gap-2">{EVENT_TYPES.map(([type, label]) => <Button key={type} type="button" variant={preferences.eventTypes.includes(type) ? 'default' : 'outline'} onClick={() => toggleEvent(type)}>{label}</Button>)}</div></CardContent></Card>
        <Button onClick={save} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
    </div>
  );
}
