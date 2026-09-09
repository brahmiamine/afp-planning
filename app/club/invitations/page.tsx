'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInvitations } from '@/app/hooks/useInvitations';
import { apiPost, apiDelete } from '@/lib/utils/api';
import {
  ACCESS_ROLE_LABELS,
  PLANNING_FUNCTION_LABELS,
  type ClubAccessRole,
  type PlanningFunction,
} from '@/lib/auth/roles';
import { AccessRoleFields } from '@/app/components/configuration/AccessRoleFields';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';

type StatusFilter = 'all' | 'pending' | 'used' | 'expired';

function invitationStatus(invitation: { usedAt: string | null; expiresAt: string }): Exclude<StatusFilter, 'all'> {
  if (invitation.usedAt) return 'used';
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'pending';
}

const STATUS_LABELS: Record<Exclude<StatusFilter, 'all'>, string> = {
  pending: 'En attente',
  used: 'Utilisée',
  expired: 'Expirée',
};

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
        {copied ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function InvitationsPage() {
  const { invitations, isLoading, reload } = useInvitations();

  const [inviteAccessRole, setInviteAccessRole] = useState<ClubAccessRole>('dirigeant');
  const [inviteFunctions, setInviteFunctions] = useState<PlanningFunction[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePersonNom, setInvitePersonNom] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredInvitations = useMemo(() => {
    if (statusFilter === 'all') return invitations;
    return invitations.filter((invitation) => invitationStatus(invitation) === statusFilter);
  }, [invitations, statusFilter]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const data = await apiPost<{ url: string }>('/api/invitations', {
        accessRole: inviteAccessRole,
        planningFunctions: inviteFunctions,
        email: inviteEmail || undefined,
        personNom: invitePersonNom || undefined,
      });
      const fullUrl = `${window.location.origin}${data.url}`;
      setLastInviteUrl(fullUrl);
      setInviteEmail('');
      setInvitePersonNom('');
      toast.success('Lien d\'invitation généré');
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      await apiDelete(`/api/invitations/${token}`);
      toast.success('Invitation révoquée');
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
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Link2 className="h-6 w-6" /> Invitations
        </h2>
        <p className="text-sm text-muted-foreground">
          Générez un lien d&apos;invitation à copier-coller et à partager avec la personne à inviter.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouvelle invitation</CardTitle>
          <CardDescription>Le lien est valable un temps limité et à usage unique.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <AccessRoleFields
              idPrefix="invite"
              accessRole={inviteAccessRole}
              planningFunctions={inviteFunctions}
              onAccessRoleChange={(accessRole) => {
                setInviteAccessRole(accessRole);
                if (accessRole === 'admin') setInviteFunctions([]);
              }}
              onPlanningFunctionsChange={setInviteFunctions}
            />
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
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Génération...' : 'Générer un lien d\'invitation'}
          </Button>

          {lastInviteUrl && (
            <div className="pt-2 space-y-1">
              <Label>Lien généré</Label>
              <CopyableUrlField url={lastInviteUrl} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Invitations créées</CardTitle>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="used">Utilisées</option>
              <option value="expired">Expirées</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Rôle</th>
                  <th className="px-3 py-2 font-medium">Fonctions</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Personne liée</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Expire le</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvitations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      {invitations.length === 0 ? 'Aucune invitation créée' : 'Aucune invitation ne correspond au filtre'}
                    </td>
                  </tr>
                ) : (
                  filteredInvitations.map((invitation) => {
                    const status = invitationStatus(invitation);
                    return (
                      <tr key={invitation.id} className="border-b last:border-0 hover:bg-accent/50">
                        <td className="px-3 py-2 font-medium text-foreground">
                          {ACCESS_ROLE_LABELS[invitation.accessRole]}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {invitation.planningFunctions.map((fn) => PLANNING_FUNCTION_LABELS[fn]).join(', ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{invitation.email || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{invitation.personNom || '—'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              status === 'pending'
                                ? 'inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                                : status === 'used'
                                  ? 'inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                  : 'inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
                            }
                          >
                            {STATUS_LABELS[status]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(invitation.expiresAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end">
                            {status === 'pending' && (
                              <Button variant="ghost" size="icon" onClick={() => handleRevoke(invitation.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
