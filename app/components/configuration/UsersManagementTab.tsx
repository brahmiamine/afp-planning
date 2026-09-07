'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, UserCog, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useUsers } from '@/app/hooks/useUsers';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiDelete } from '@/lib/utils/api';
import { ALL_ROLES, ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';

type StatusFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'all' | UserRole;

export function UsersManagementTab() {
  const router = useRouter();
  const { user: currentUser } = useCurrentUser();
  const { users, isLoading, reload } = useUsers();

  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== 'all' && !user.roles.includes(roleFilter)) return false;
      if (statusFilter === 'active' && !user.active) return false;
      if (statusFilter === 'inactive' && user.active) return false;
      if (term) {
        const haystack = `${user.nom} ${user.email} ${user.telephone ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleDeleteUser = async () => {
    if (deleteUserId === null) return;
    try {
      await apiDelete(`/api/users/${deleteUserId}`);
      toast.success('Utilisateur supprimé');
      setDeleteUserId(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  if (isLoading) {
    return <LoadingSpinner size={40} text="Chargement..." className="py-20" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Utilisateurs
              </CardTitle>
              <CardDescription>Gérez les comptes et les rôles des utilisateurs de l&apos;application</CardDescription>
            </div>
            <Button onClick={() => router.push('/club/utilisateurs/nouveau')} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher par nom, email ou téléphone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="all">Tous les rôles</option>
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Désactivés</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Téléphone</th>
                  <th className="px-3 py-2 font-medium">Rôles</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      {users.length === 0 ? 'Aucun utilisateur' : 'Aucun utilisateur ne correspond aux filtres'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="px-3 py-2 font-medium text-foreground">{user.nom}</td>
                      <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
                      <td className="px-3 py-2 text-muted-foreground">{user.telephone || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {user.roles.map((role) => ROLE_LABELS[role]).join(', ')}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            user.active
                              ? 'inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400'
                              : 'inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
                          }
                        >
                          {user.active ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => router.push(`/club/utilisateurs/${user.id}`)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={user.id === currentUser?.id}
                            onClick={() => setDeleteUserId(user.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            {filteredUsers.length} / {users.length} utilisateur{users.length > 1 ? 's' : ''}
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={deleteUserId !== null} onOpenChange={(open) => !open && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
