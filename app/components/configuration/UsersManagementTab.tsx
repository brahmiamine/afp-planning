'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
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
import { Plus, Pencil, Trash2, Copy, Check, UserCog, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUsers } from '@/app/hooks/useUsers';
import { useInvitations } from '@/app/hooks/useInvitations';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiPost, apiDelete } from '@/lib/utils/api';
import { INVITABLE_ROLES, ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';

function CopyableUrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Lien copié');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier le lien');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input value={url} readOnly className="font-mono text-xs" />
      <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function UsersManagementTab() {
  const router = useRouter();
  const { user: currentUser } = useCurrentUser();
  const { users, isLoading, reload } = useUsers();
  const { invitations, isLoading: isLoadingInvitations, reload: reloadInvitations } = useInvitations();

  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);

  const [inviteRole, setInviteRole] = useState<UserRole>('arbitre');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePersonNom, setInvitePersonNom] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

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

  const handleCreateInvitation = async () => {
    setIsCreatingInvite(true);
    try {
      const data = await apiPost<{ url: string }>('/api/invitations', {
        role: inviteRole,
        email: inviteEmail || undefined,
        personNom: invitePersonNom || undefined,
      });
      const fullUrl = `${window.location.origin}${data.url}`;
      setLastInviteUrl(fullUrl);
      setInviteEmail('');
      setInvitePersonNom('');
      toast.success('Lien d\'invitation généré');
      await reloadInvitations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleRevokeInvitation = async (token: string) => {
    try {
      await apiDelete(`/api/invitations/${token}`);
      toast.success('Invitation révoquée');
      await reloadInvitations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  if (isLoading || isLoadingInvitations) {
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
            <Button onClick={() => router.push('/configuration/utilisateurs/nouveau')} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucun utilisateur</p>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {user.nom} {!user.active && <span className="text-xs text-destructive">(désactivé)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">{user.roles.map((role) => ROLE_LABELS[role]).join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push(`/configuration/utilisateurs/${user.id}`)}>
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
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Invitations
          </CardTitle>
          <CardDescription>
            Générez un lien d&apos;invitation à copier-coller et à partager avec la personne à inviter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="invite-role">Rôle</Label>
              <select
                id="invite-role"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
              >
                {INVITABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email (optionnel)</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="vous@exemple.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-person">Lier à un officiel/encadrant (optionnel)</Label>
              <Input
                id="invite-person"
                placeholder="Nom exact"
                value={invitePersonNom}
                onChange={(e) => setInvitePersonNom(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleCreateInvitation} disabled={isCreatingInvite}>
            {isCreatingInvite ? 'Génération...' : 'Générer un lien d\'invitation'}
          </Button>

          {lastInviteUrl && (
            <div className="pt-2 space-y-1">
              <Label>Lien généré</Label>
              <CopyableUrlField url={lastInviteUrl} />
            </div>
          )}

          <div className="pt-2 space-y-2">
            {invitations.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune invitation créée</p>
            ) : (
              invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-2 rounded-lg border text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {ROLE_LABELS[invitation.role]}
                      {invitation.email ? ` — ${invitation.email}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {invitation.usedAt
                        ? 'Utilisée'
                        : new Date(invitation.expiresAt).getTime() <= Date.now()
                          ? 'Expirée'
                          : `Expire le ${new Date(invitation.expiresAt).toLocaleDateString('fr-FR')}`}
                    </p>
                  </div>
                  {!invitation.usedAt && (
                    <Button variant="ghost" size="icon" onClick={() => handleRevokeInvitation(invitation.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
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
