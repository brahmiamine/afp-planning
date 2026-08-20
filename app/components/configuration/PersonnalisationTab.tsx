'use client';

import { useEffect, useState } from 'react';
import { Palette, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { toast } from 'sonner';
import { useAppSettings } from '@/app/hooks/useAppSettings';
import { applyThemeVariables, type ThemeMode } from '@/lib/settings';

export function PersonnalisationTab() {
  const { settings, isLoading, saveSettings, error: settingsError } = useAppSettings();
  const [form, setForm] = useState({
    clubName: '',
    clubDescription: '',
    clubLogo: '',
    matchesUrlKey: 'academie-football-paris-18',
    themeMode: 'system' as ThemeMode,
    primaryColor: '#1f2937',
    accentColor: '#e5e7eb',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm({
      clubName: settings.clubName,
      clubDescription: settings.clubDescription,
      clubLogo: settings.clubLogo,
      matchesUrlKey: settings.matchesUrlKey,
      themeMode: settings.themeMode,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
    });
  }, [settings]);

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image valide');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setForm((prev) => ({ ...prev, clubLogo: result }));
      }
    };
    reader.onerror = () => {
      toast.error('Impossible de lire le fichier image');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      if (!form.clubName.trim()) {
        toast.error('Le nom du club est requis');
        return;
      }

      setIsSaving(true);
      const saved = await saveSettings(form);
      applyThemeVariables(saved);
      toast.success('Personnalisation enregistrée');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner size={40} text="Chargement..." className="py-20" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Personnalisation de l&apos;application
        </CardTitle>
        <CardDescription>Choisissez le nom du club, le logo, le thème et les couleurs globales</CardDescription>
        {settingsError && <p className="text-sm text-destructive mt-2">Erreur paramètres: {settingsError}</p>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="branding-club-name">Nom du club *</Label>
          <Input
            id="branding-club-name"
            value={form.clubName}
            onChange={(e) => setForm((prev) => ({ ...prev, clubName: e.target.value }))}
            placeholder="Nom du club"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="branding-club-description">Description du club</Label>
          <Input
            id="branding-club-description"
            value={form.clubDescription}
            onChange={(e) => setForm((prev) => ({ ...prev, clubDescription: e.target.value }))}
            placeholder="Description courte"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="branding-matches-url-key">Clé `matches_url` (scraping)</Label>
          <Input
            id="branding-matches-url-key"
            value={form.matchesUrlKey}
            onChange={(e) => setForm((prev) => ({ ...prev, matchesUrlKey: e.target.value }))}
            placeholder="academie-football-paris-18"
          />
          <p className="text-xs text-muted-foreground">
            Utilisée pour générer l&apos;URL du scraper : sportcorico.com/clubs/&lt;matches_url&gt;
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="branding-club-logo">Logo du club (upload ou URL)</Label>
          <Input
            id="branding-club-logo"
            value={form.clubLogo}
            onChange={(e) => setForm((prev) => ({ ...prev, clubLogo: e.target.value }))}
            placeholder="https://... ou data:image/..."
          />
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              void handleLogoUpload(file);
            }}
          />
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Upload className="h-3.5 w-3.5" />
            Le fichier est converti et sauvegardé dans la base.
          </p>
          {form.clubLogo && (
            <div className="flex items-center gap-3 pt-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.clubLogo} alt="Logo du club" className="w-16 h-16 rounded-full object-cover border" />
              <span className="text-sm text-muted-foreground">Aperçu du logo</span>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="branding-theme-mode">Thème</Label>
            <select
              id="branding-theme-mode"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.themeMode}
              onChange={(e) => {
                const value = e.target.value as ThemeMode;
                setForm((prev) => ({ ...prev, themeMode: value }));
              }}
            >
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
              <option value="system">Système</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-primary-color">Couleur principale</Label>
            <Input
              id="branding-primary-color"
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
              className="h-10 p-1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-accent-color">Couleur secondaire</Label>
            <Input
              id="branding-accent-color"
              type="color"
              value={form.accentColor}
              onChange={(e) => setForm((prev) => ({ ...prev, accentColor: e.target.value }))}
              className="h-10 p-1"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Enregistrement...' : 'Enregistrer la personnalisation'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
