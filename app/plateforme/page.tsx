'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Switch } from '@/app/components/ui/switch';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Database,
  Plus,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/lib/utils/api';
import { OpponentClubsSection } from '@/app/components/plateforme/OpponentClubsSection';

interface PlatformAdmin {
  id: number;
  email: string;
  nom: string;
}

interface ClubRow {
  id: string;
  name: string;
  active: boolean;
  matchesUrlKey: string;
  scraperClubName: string;
  createdAt: string;
}

interface AdminRow {
  id: number;
  email: string;
  nom: string;
  active: boolean;
  createdAt: string;
}

export default function PlatformDashboardPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [isLoadingClubs, setIsLoadingClubs] = useState(true);

  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);
  const [adminsByClub, setAdminsByClub] = useState<Record<string, AdminRow[]>>({});
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
  const [isSavingScrapingClubId, setIsSavingScrapingClubId] = useState<string | null>(null);

  const [isNewClubOpen, setIsNewClubOpen] = useState(false);
  const [newClubId, setNewClubId] = useState('');
  const [newClubName, setNewClubName] = useState('');
  const [newClubMatchesUrlKey, setNewClubMatchesUrlKey] = useState('');
  const [newClubScraperClubName, setNewClubScraperClubName] = useState('');
  const [isCreatingClub, setIsCreatingClub] = useState(false);

  const [newAdminClubId, setNewAdminClubId] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminNom, setNewAdminNom] = useState('');
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  const loadClubs = useCallback(async () => {
    setIsLoadingClubs(true);
    try {
      const data = await apiGet<{ clubs: ClubRow[] }>('/api/plateforme/clubs');
      setClubs(data.clubs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les clubs');
    } finally {
      setIsLoadingClubs(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<{ admin: PlatformAdmin }>('/api/plateforme/me');
        setAdmin(data.admin);
      } catch {
        router.replace('/plateforme/login');
        return;
      } finally {
        setIsCheckingAuth(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (admin) {
      void loadClubs();
    }
  }, [admin, loadClubs]);

  const loadAdmins = useCallback(async (clubId: string) => {
    setIsLoadingAdmins(true);
    try {
      const data = await apiGet<{ admins: AdminRow[] }>(`/api/plateforme/clubs/${clubId}/admins`);
      setAdminsByClub((prev) => ({ ...prev, [clubId]: data.admins }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les administrateurs');
    } finally {
      setIsLoadingAdmins(false);
    }
  }, []);

  const handleToggleExpand = (clubId: string) => {
    if (expandedClubId === clubId) {
      setExpandedClubId(null);
      return;
    }
    setExpandedClubId(clubId);
    if (!adminsByClub[clubId]) {
      void loadAdmins(clubId);
    }
  };

  const updateClubDraft = (clubId: string, patch: Partial<Pick<ClubRow, 'matchesUrlKey' | 'scraperClubName'>>) => {
    setClubs((current) => current.map((club) => (club.id === clubId ? { ...club, ...patch } : club)));
  };

  const handleSaveScraping = async (club: ClubRow) => {
    setIsSavingScrapingClubId(club.id);
    try {
      await apiPatch(`/api/plateforme/clubs/${club.id}`, {
        matchesUrlKey: club.matchesUrlKey.trim(),
        scraperClubName: club.scraperClubName.trim(),
      });
      toast.success('Source de scraping enregistrée');
      await loadClubs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d\'enregistrer la source de scraping');
    } finally {
      setIsSavingScrapingClubId(null);
    }
  };

  const handleToggleClubActive = async (club: ClubRow) => {
    try {
      await apiPatch(`/api/plateforme/clubs/${club.id}`, { active: !club.active });
      toast.success(club.active ? 'Club désactivé' : 'Club activé');
      await loadClubs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  const handleCreateClub = async () => {
    setIsCreatingClub(true);
    try {
      await apiPost('/api/plateforme/clubs', {
        id: newClubId.trim(),
        name: newClubName.trim(),
        matchesUrlKey: newClubMatchesUrlKey.trim(),
        scraperClubName: newClubScraperClubName.trim(),
      });
      toast.success('Club créé');
      setIsNewClubOpen(false);
      setNewClubId('');
      setNewClubName('');
      setNewClubMatchesUrlKey('');
      setNewClubScraperClubName('');
      await loadClubs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de créer le club');
    } finally {
      setIsCreatingClub(false);
    }
  };

  const handleToggleAdminActive = async (clubId: string, target: AdminRow) => {
    try {
      await apiPatch(`/api/plateforme/clubs/${clubId}/admins/${target.id}`, {
        active: !target.active,
      });
      toast.success(target.active ? 'Administrateur désactivé' : 'Administrateur réactivé');
      await loadAdmins(clubId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  const handleCreateAdmin = async () => {
    if (!newAdminClubId) return;
    setIsCreatingAdmin(true);
    try {
      await apiPost(`/api/plateforme/clubs/${newAdminClubId}/admins`, {
        email: newAdminEmail.trim(),
        password: newAdminPassword,
        nom: newAdminNom.trim(),
      });
      toast.success('Administrateur créé');
      const clubId = newAdminClubId;
      setNewAdminClubId(null);
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewAdminNom('');
      await loadAdmins(clubId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de créer l\'administrateur');
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size={40} text="Chargement..." />
      </div>
    );
  }

  if (!admin) {
    return null;
  }

  return (
    <>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Clubs
                </CardTitle>
                <CardDescription>
                  Gérez les tenants et leur source de scraping. Ces paramètres techniques sont réservés à la plateforme.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setIsNewClubOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau club
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingClubs ? (
              <LoadingSpinner size={32} text="Chargement..." className="py-10" />
            ) : clubs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucun club</p>
            ) : (
              <div className="space-y-2">
                {clubs.map((club) => {
                  const isExpanded = expandedClubId === club.id;
                  const admins = adminsByClub[club.id] ?? [];
                  const isSavingScraping = isSavingScrapingClubId === club.id;

                  return (
                    <div key={club.id} className="rounded-lg border bg-card overflow-hidden">
                      <div className="flex items-center justify-between p-3 gap-3">
                        <button
                          type="button"
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          onClick={() => handleToggleExpand(club.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {club.name}
                              {!club.active && <span className="text-xs text-destructive ml-2">(désactivé)</span>}
                            </p>
                            <p className="text-sm text-muted-foreground truncate font-mono">{club.id}</p>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <Label htmlFor={`club-active-${club.id}`} className="text-xs text-muted-foreground">
                            Actif
                          </Label>
                          <Switch
                            id={`club-active-${club.id}`}
                            checked={club.active}
                            onCheckedChange={() => handleToggleClubActive(club)}
                          />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t bg-muted/30 p-3 space-y-4">
                          <div className="rounded-lg border bg-card p-4 space-y-4">
                            <div>
                              <p className="text-sm font-semibold flex items-center gap-2">
                                <Database className="h-4 w-4" />
                                Source de scraping
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Configuration technique réservée au Superadmin plateforme. Elle n&apos;est pas modifiable depuis l&apos;administration du club.
                              </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`matches-url-key-${club.id}`}>matchesUrlKey</Label>
                                <Input
                                  id={`matches-url-key-${club.id}`}
                                  value={club.matchesUrlKey}
                                  onChange={(event) => updateClubDraft(club.id, { matchesUrlKey: event.target.value })}
                                  placeholder="academie-football-paris-18"
                                  disabled={isSavingScraping}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Clé utilisée dans l&apos;URL de la source SportCorico.
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`scraper-club-name-${club.id}`}>scraperClubName</Label>
                                <Input
                                  id={`scraper-club-name-${club.id}`}
                                  value={club.scraperClubName}
                                  onChange={(event) => updateClubDraft(club.id, { scraperClubName: event.target.value })}
                                  placeholder="Nom exact utilisé par la source"
                                  disabled={isSavingScraping}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Nom attendu pour vérifier que les matchs récupérés appartiennent bien à ce club.
                                </p>
                              </div>
                            </div>

                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                onClick={() => handleSaveScraping(club)}
                                disabled={isSavingScraping}
                              >
                                <Save className="h-4 w-4 mr-2" />
                                {isSavingScraping ? 'Enregistrement...' : 'Enregistrer la source'}
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-sm font-medium flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" />
                                Administrateurs
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setNewAdminClubId(club.id)}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Nouvel administrateur
                              </Button>
                            </div>

                            {isLoadingAdmins && !adminsByClub[club.id] ? (
                              <LoadingSpinner size={24} text="Chargement..." className="py-4" />
                            ) : admins.length === 0 ? (
                              <p className="text-muted-foreground text-sm py-2">Aucun administrateur</p>
                            ) : (
                              <div className="space-y-2">
                                {admins.map((row) => (
                                  <div
                                    key={row.id}
                                    className="flex items-center justify-between p-2 rounded-md border bg-card text-sm"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium truncate">
                                        {row.nom}
                                        {!row.active && (
                                          <span className="text-xs text-destructive ml-2">(désactivé)</span>
                                        )}
                                      </p>
                                      <p className="text-muted-foreground truncate">{row.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-4 shrink-0">
                                      <Switch
                                        checked={row.active}
                                        onCheckedChange={() => handleToggleAdminActive(club.id, row)}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <OpponentClubsSection clubId={club.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      <Dialog open={isNewClubOpen} onOpenChange={setIsNewClubOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau club</DialogTitle>
            <DialogDescription>
              Créez un nouveau club (tenant) et configurez sa source de scraping côté plateforme.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-club-id">Identifiant (slug)</Label>
              <Input
                id="new-club-id"
                placeholder="mon-club"
                value={newClubId}
                onChange={(event) => setNewClubId(event.target.value.toLowerCase())}
                disabled={isCreatingClub}
              />
              <p className="text-xs text-muted-foreground">
                Lettres minuscules, chiffres et tirets uniquement (2 à 64 caractères).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-club-name">Nom du club</Label>
              <Input
                id="new-club-name"
                placeholder="Mon Club de Football"
                value={newClubName}
                onChange={(event) => setNewClubName(event.target.value)}
                disabled={isCreatingClub}
              />
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" />
                Source de scraping
              </p>
              <div className="space-y-2">
                <Label htmlFor="new-club-matches-url-key">matchesUrlKey</Label>
                <Input
                  id="new-club-matches-url-key"
                  placeholder="academie-football-paris-18"
                  value={newClubMatchesUrlKey}
                  onChange={(event) => setNewClubMatchesUrlKey(event.target.value.toLowerCase())}
                  disabled={isCreatingClub}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-club-scraper-name">scraperClubName</Label>
                <Input
                  id="new-club-scraper-name"
                  placeholder="Nom exact utilisé par la source"
                  value={newClubScraperClubName}
                  onChange={(event) => setNewClubScraperClubName(event.target.value)}
                  disabled={isCreatingClub}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewClubOpen(false)} disabled={isCreatingClub}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateClub}
              disabled={isCreatingClub || !newClubId.trim() || !newClubName.trim()}
            >
              {isCreatingClub ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newAdminClubId !== null} onOpenChange={(open) => !open && setNewAdminClubId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvel administrateur</DialogTitle>
            <DialogDescription>
              Créez un compte administrateur pour ce club.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-admin-nom">Nom</Label>
              <Input
                id="new-admin-nom"
                value={newAdminNom}
                onChange={(event) => setNewAdminNom(event.target.value)}
                disabled={isCreatingAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-admin-email">Email</Label>
              <Input
                id="new-admin-email"
                type="email"
                value={newAdminEmail}
                onChange={(event) => setNewAdminEmail(event.target.value)}
                disabled={isCreatingAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-admin-password">Mot de passe</Label>
              <Input
                id="new-admin-password"
                type="password"
                value={newAdminPassword}
                onChange={(event) => setNewAdminPassword(event.target.value)}
                disabled={isCreatingAdmin}
              />
              <p className="text-xs text-muted-foreground">Au moins 8 caractères.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewAdminClubId(null)} disabled={isCreatingAdmin}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateAdmin}
              disabled={
                isCreatingAdmin
                || !newAdminNom.trim()
                || !newAdminEmail.trim()
                || newAdminPassword.length < 8
              }
            >
              {isCreatingAdmin ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
