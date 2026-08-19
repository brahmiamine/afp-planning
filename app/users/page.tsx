'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, UserRound, Power } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useMatches } from '@/hooks/useMatches';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';
import type { AuthUserSummary, PersonOptionsByRole, PersonRole } from '@/types/auth';

type UsersResponse = {
  users: AuthUserSummary[];
  options: PersonOptionsByRole;
};

const ROLE_LABELS: Record<AuthUserSummary['role'], string> = {
  SUPER_ADMIN: 'Super Admin',
  ARBITRE: 'Arbitre',
  ENCADRANT: 'Encadrant',
  ACCOMPAGNATEUR: 'Accompagnateur',
};

const EMPTY_OPTIONS: PersonOptionsByRole = {
  ARBITRE: [],
  ENCADRANT: [],
  ACCOMPAGNATEUR: [],
};

export default function UsersPage() {
  const { matchesData, reload: reloadMatches } = useMatches();
  const [data, setData] = useState<UsersResponse>({ users: [], options: EMPTY_OPTIONS });
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUserSummary | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<PersonRole>('ARBITRE');
  const [personId, setPersonId] = useState('');
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/users');
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Impossible de charger les comptes');
      }

      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les comptes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const availablePeople = useMemo(() => data.options[role] ?? [], [data.options, role]);

  const openCreate = () => {
    setEditingUser(null);
    setEmail('');
    setPassword('');
    setRole('ARBITRE');
    setPersonId('');
    setActive(true);
    setDialogOpen(true);
  };

  const openEdit = (user: AuthUserSummary) => {
    if (!user.editable || user.role === 'SUPER_ADMIN') {
      return;
    }

    setEditingUser(user);
    setEmail(user.email);
    setPassword('');
    setRole(user.role);
    setPersonId(user.personId ? String(user.personId) : '');
    setActive(user.active);
    setDialogOpen(true);
  };

  const saveUser = async () => {
    if (!email.trim() || !personId || (!editingUser && !password)) {
      toast.error('Email, personne et mot de passe sont requis');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/users', {
        method: editingUser ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingUser ? { id: editingUser.id } : {}),
          email,
          password,
          role,
          personId: Number(personId),
          active,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Enregistrement impossible');
      }

      toast.success(editingUser ? 'Compte mis à jour' : 'Compte créé');
      setDialogOpen(false);
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteUser = async (user: AuthUserSummary) => {
    if (!user.editable || !window.confirm(`Supprimer le compte ${user.email} ?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users?id=${user.id}`, { method: 'DELETE' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Suppression impossible');
      }

      toast.success('Compte supprimé');
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header club={matchesData?.club} onScrapeComplete={reloadMatches} />

      <main className="container mx-auto px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Comptes et accès</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Créez les accès personnels liés aux arbitres, encadrants et accompagnateurs du planning.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau compte
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5" />
              Super Admin
            </CardTitle>
            <CardDescription>
              Le compte Super Admin est initialisé depuis les variables serveur et possède l'accès complet.
            </CardDescription>
          </CardHeader>
        </Card>

        {isLoading ? (
          <LoadingSpinner size={48} text="Chargement des comptes..." className="py-20" />
        ) : (
          <div className="grid gap-4">
            {data.users.map((user) => (
              <Card key={user.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      {user.role === 'SUPER_ADMIN' ? (
                        <ShieldCheck className="h-5 w-5" />
                      ) : (
                        <UserRound className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{user.personName || user.email}</p>
                        <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
                        <Badge variant={user.active ? 'default' : 'outline'}>
                          {user.active ? 'Actif' : 'Désactivé'}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>

                  {user.editable && (
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Modifier
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void deleteUser(user)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {data.users.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Aucun compte disponible.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Modifier le compte' : 'Créer un compte personnel'}</DialogTitle>
            <DialogDescription>
              Le compte sera lié à une personne déjà présente dans la configuration du planning.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="account-email">Email</Label>
              <Input
                id="account-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="personne@club.fr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-role">Rôle</Label>
              <select
                id="account-role"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as PersonRole);
                  setPersonId('');
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="ARBITRE">Arbitre</option>
                <option value="ENCADRANT">Encadrant</option>
                <option value="ACCOMPAGNATEUR">Accompagnateur</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-person">Personne</Label>
              <select
                id="account-person"
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sélectionner</option>
                {availablePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.nom}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-password">
                Mot de passe {editingUser ? '(laisser vide pour conserver)' : ''}
              </Label>
              <Input
                id="account-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="8 caractères minimum"
              />
            </div>

            {editingUser && (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Power className="h-4 w-4" />
                  Compte actif
                </span>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Annuler
            </Button>
            <Button onClick={() => void saveUser()} disabled={isSaving}>
              {isSaving ? 'Enregistrement...' : editingUser ? 'Enregistrer' : 'Créer le compte'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
