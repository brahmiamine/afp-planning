'use client';

import { useEffect, useState } from 'react';
import { Mail, Palette, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { toast } from 'sonner';
import { useAppSettings } from '@/app/hooks/useAppSettings';
import { applyThemeVariables, type ThemeMode } from '@/lib/settings';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

export function PersonnalisationTab() {
  const { settings, isLoading, saveSettings, error: settingsError } = useAppSettings();
  const { user } = useCurrentUser();
  const isSuperadmin = !!user?.roles.includes('superadmin');
  const [form, setForm] = useState({
    clubName: '',
    clubDescription: '',
    clubLogo: '',
    matchesUrlKey: 'academie-football-paris-18',
    scraperClubName: '',
    themeMode: 'system' as ThemeMode,
    primaryColor: '#1f2937',
    accentColor: '#e5e7eb',
  });
  const [smtp, setSmtp] = useState({
    host: '',
    port: '',
    secure: false,
    user: '',
    fromEmail: '',
    fromName: '',
    passwordSet: false,
    password: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm({
      clubName: settings.clubName,
      clubDescription: settings.clubDescription,
      clubLogo: settings.clubLogo,
      matchesUrlKey: settings.matchesUrlKey,
      scraperClubName: settings.scraperClubName,
      themeMode: settings.themeMode,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
    });
    setSmtp({
      host: settings.smtp.host,
      port: settings.smtp.port ? String(settings.smtp.port) : '',
      secure: settings.smtp.secure,
      user: settings.smtp.user,
      fromEmail: settings.smtp.fromEmail,
      fromName: settings.smtp.fromName,
      passwordSet: settings.smtp.passwordSet,
      password: '',
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
      const port = Number.parseInt(smtp.port, 10);
      const payload = {
        ...form,
        smtp: {
          host: smtp.host,
          port: Number.isFinite(port) && port > 0 ? port : null,
          secure: smtp.secure,
          user: smtp.user,
          fromEmail: smtp.fromEmail,
          fromName: smtp.fromName,
          passwordSet: smtp.passwordSet,
        },
      };
      const saved = await saveSettings(payload, isSuperadmin ? smtp.password.trim() || undefined : undefined);
      applyThemeVariables(saved);
      setSmtp((prev) => ({ ...prev, password: '' }));
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
          <Label htmlFor="branding-scraper-club-name">Nom du club côté scraper</Label>
          <Input
            id="branding-scraper-club-name"
            value={form.scraperClubName}
            onChange={(e) => setForm((prev) => ({ ...prev, scraperClubName: e.target.value }))}
            placeholder="Nom exact utilisé par la source de scraping"
          />
          <p className="text-xs text-muted-foreground">
            Sert à vérifier que les matchs scrapés correspondent bien à ce club.
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

        {isSuperadmin && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Email SMTP du club</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Configuré ici, ce serveur SMTP est utilisé uniquement pour les notifications de ce club. Laissez vide pour retomber sur la configuration par défaut du déploiement.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-host">Hôte SMTP</Label>
                <Input id="smtp-host" value={smtp.host} onChange={(e) => setSmtp((prev) => ({ ...prev, host: e.target.value }))} placeholder="smtp.example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-port">Port</Label>
                <Input id="smtp-port" type="number" value={smtp.port} onChange={(e) => setSmtp((prev) => ({ ...prev, port: e.target.value }))} placeholder="587" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-user">Utilisateur</Label>
                <Input id="smtp-user" value={smtp.user} onChange={(e) => setSmtp((prev) => ({ ...prev, user: e.target.value }))} placeholder="notifications@club.fr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-password">Mot de passe {smtp.passwordSet && <span className="text-xs text-muted-foreground">(déjà enregistré)</span>}</Label>
                <Input id="smtp-password" type="password" value={smtp.password} onChange={(e) => setSmtp((prev) => ({ ...prev, password: e.target.value }))} placeholder={smtp.passwordSet ? '••••••••' : ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-from-email">Email expéditeur</Label>
                <Input id="smtp-from-email" type="email" value={smtp.fromEmail} onChange={(e) => setSmtp((prev) => ({ ...prev, fromEmail: e.target.value }))} placeholder="notifications@club.fr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-from-name">Nom expéditeur</Label>
                <Input id="smtp-from-name" value={smtp.fromName} onChange={(e) => setSmtp((prev) => ({ ...prev, fromName: e.target.value }))} placeholder="Nom du club" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="smtp-secure" checked={smtp.secure} onCheckedChange={(checked) => setSmtp((prev) => ({ ...prev, secure: checked }))} />
              <Label htmlFor="smtp-secure">Connexion sécurisée (TLS implicite)</Label>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Enregistrement...' : 'Enregistrer la personnalisation'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
