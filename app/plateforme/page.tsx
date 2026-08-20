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
import { Building2, ChevronDown, ChevronRight, LogOut, Plus, ShieldCheck } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/lib/utils/api';

interface PlatformAdmin {
  id: number;
  email: string;
  nom: string;
}

interface ClubRow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

interface SuperadminRow {
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
  const [superadminsByClub, setSuperadminsByClub] = useState<Record<string, SuperadminRow[]>>({});
  const [isLoadingSuperadmins, setIsLoadingSuperadmins] = useState(false);

  const [isNewClubOpen, setIsNewClubOpen] = useState(false);
  const [newClubId, setNewClubId] = useState('');
  const [newClubName, setNewClubName] = useState('');
  const [isCreatingClub, setIsCreatingClub] = useState(false);

  const [newSuperadminClubId, setNewSuperadminClubId] = useState<string | null>(null);
  const [newSuperadminEmail, setNewSuperadminEmail] = useState('');
  const [newSuperadminPassword, setNewSuperadminPassword] = useState('');
  const [newSuperadminNom, setNewSuperadminNom] = useState('');
  const [isCreatingSuperadmin, setIsCreatingSuperadmin] = useState(false);

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
      loadClubs();
    }
  }, [admin, loadClubs]);

  const loadSuperadmins = useCallback(async (clubId: string) => {
    setIsLoadingSuperadmins(true);
    try {
      const data = await apiGet<{ superadmins: SuperadminRow[] }>(`/api/plateforme/clubs/${clubId}/superadmins`);
      setSuperadminsByClub((prev) => ({ ...prev, [clubId]: data.superadmins }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les superadministrateurs');
    } finally {
      setIsLoadingSuperadmins(false);
    }
  }, []);

  const handleToggleExpand = (clubId: string) => {
    if (expandedClubId === clubId) {
      setExpandedClubId(null);
      return;
    }
    setExpandedClubId(clubId);
    if (!superadminsByClub[clubId]) {
      loadSuperadmins(clubId);
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
      await apiPost('/api/plateforme/clubs', { id: newClubId.trim(), name: newClubName.trim() });
      toast.success('Club créé');
      setIsNewClubOpen(false);
      setNewClubId('');
      setNewClubName('');
      await loadClubs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de créer le club');
    } finally {
      setIsCreatingClub(false);
    }
  };

  const handleToggleSuperadminActive = async (clubId: string, superadmin: SuperadminRow) => {
    try {
      await apiPatch(`/api/plateforme/clubs/${clubId}/superadmins/${superadmin.id}`, {
        active: !superadmin.active,
      });
      toast.success(superadmin.active ? 'Superadministrateur désactivé' : 'Superadministrateur réactivé');
      await loadSuperadmins(clubId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  const handleCreateSuperadmin = async () => {
    if (!newSuperadminClubId) return;
    setIsCreatingSuperadmin(true);
    try {
      await apiPost(`/api/plateforme/clubs/${newSuperadminClubId}/superadmins`, {
        email: newSuperadminEmail.trim(),
        password: newSuperadminPassword,
        nom: newSuperadminNom.trim(),
      });
      toast.success('Superadministrateur créé');
      const clubId = newSuperadminClubId;
      setNewSuperadminClubId(null);
      setNewSuperadminEmail('');
      setNewSuperadminPassword('');
      setNewSuperadminNom('');
      await loadSuperadmins(clubId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de créer le superadministrateur');
    } finally {
      setIsCreatingSuperadmin(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/plateforme/logout', { method: 'POST' });
    } finally {
      router.replace('/plateforme/login');
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Administration plateforme</h1>
            <p className="text-sm text-muted-foreground">Connecté en tant que {admin.nom} ({admin.email})</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Déconnexion
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Clubs
                </CardTitle>
                <CardDescription>Gérez les clubs (tenants) hébergés sur cette plateforme</CardDescription>
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
                  const superadmins = superadminsByClub[club.id] ?? [];
                  return (
                    <div key={club.id} className="rounded-lg border bg-card overflow-hidden">
                      <div className="flex items-center justify-between p-3">
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
                        <div className="flex items-center gap-2 ml-4 shrink-0">
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
                        <div className="border-t bg-muted/30 p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4" />
                              Superadministrateurs
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setNewSuperadminClubId(club.id)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Nouveau superadmin
                            </Button>
                          </div>

                          {isLoadingSuperadmins && !superadminsByClub[club.id] ? (
                            <LoadingSpinner size={24} text="Chargement..." className="py-4" />
                          ) : superadmins.length === 0 ? (
                            <p className="text-muted-foreground text-sm py-2">Aucun superadministrateur</p>
                          ) : (
                            <div className="space-y-2">
                              {superadmins.map((superadmin) => (
                                <div
                                  key={superadmin.id}
                                  className="flex items-center justify-between p-2 rounded-md border bg-card text-sm"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">
                                      {superadmin.nom}
                                      {!superadmin.active && (
                                        <span className="text-xs text-destructive ml-2">(désactivé)</span>
                                      )}
                                    </p>
                                    <p className="text-muted-foreground truncate">{superadmin.email}</p>
                                  </div>
                                  <div className="flex items-center gap-2 ml-4 shrink-0">
                                    <Switch
                                      checked={superadmin.active}
                                      onCheckedChange={() => handleToggleSuperadminActive(club.id, superadmin)}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={isNewClubOpen} onOpenChange={setIsNewClubOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau club</DialogTitle>
            <DialogDescription>
              Créez un nouveau club (tenant). L&apos;identifiant sert de slug technique et ne pourra plus être modifié.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-club-id">Identifiant (slug)</Label>
              <Input
                id="new-club-id"
                placeholder="mon-club"
                value={newClubId}
                onChange={(e) => setNewClubId(e.target.value.toLowerCase())}
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
                onChange={(e) => setNewClubName(e.target.value)}
                disabled={isCreatingClub}
              />
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

      <Dialog open={newSuperadminClubId !== null} onOpenChange={(open) => !open && setNewSuperadminClubId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau superadministrateur</DialogTitle>
            <DialogDescription>
              Créez un compte superadministrateur pour ce club.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-superadmin-nom">Nom</Label>
              <Input
                id="new-superadmin-nom"
                value={newSuperadminNom}
                onChange={(e) => setNewSuperadminNom(e.target.value)}
                disabled={isCreatingSuperadmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-superadmin-email">Email</Label>
              <Input
                id="new-superadmin-email"
                type="email"
                value={newSuperadminEmail}
                onChange={(e) => setNewSuperadminEmail(e.target.value)}
                disabled={isCreatingSuperadmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-superadmin-password">Mot de passe</Label>
              <Input
                id="new-superadmin-password"
                type="password"
                value={newSuperadminPassword}
                onChange={(e) => setNewSuperadminPassword(e.target.value)}
                disabled={isCreatingSuperadmin}
              />
              <p className="text-xs text-muted-foreground">Au moins 8 caractères.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSuperadminClubId(null)} disabled={isCreatingSuperadmin}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateSuperadmin}
              disabled={
                isCreatingSuperadmin
                || !newSuperadminNom.trim()
                || !newSuperadminEmail.trim()
                || newSuperadminPassword.length < 8
              }
            >
              {isCreatingSuperadmin ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
