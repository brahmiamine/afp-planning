'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, X, Building2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
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
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/utils/api';
import { toast } from 'sonner';

interface OpponentClub {
  nom: string;
  logo: string;
}

export function OpponentClubsSection({ clubId }: { clubId: string }) {
  const [clubs, setClubs] = useState<OpponentClub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; club?: OpponentClub }>({ open: false });
  const [deleteClub, setDeleteClub] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: '', logo: '' });
  const [search, setSearch] = useState('');

  const endpoint = `/api/plateforme/clubs/${clubId}/opponent-clubs`;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<{ clubs: OpponentClub[] }>(endpoint);
      setClubs(data.clubs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les clubs');
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return clubs;
    const searchLower = search.toLowerCase();
    return clubs.filter((c) => c.nom.toLowerCase().includes(searchLower));
  }, [clubs, search]);

  const handleOpenDialog = (club?: OpponentClub) => {
    setForm(club ? { nom: club.nom, logo: club.logo } : { nom: '', logo: '' });
    setDialog(club ? { open: true, club } : { open: true });
  };

  const handleSave = async () => {
    if (!form.nom.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    if (!form.logo.trim()) {
      toast.error('Le logo est requis');
      return;
    }

    try {
      if (dialog.club) {
        await apiPut(endpoint, { oldNom: dialog.club.nom, nom: form.nom, logo: form.logo });
        toast.success('Club mis à jour');
      } else {
        await apiPost(endpoint, { nom: form.nom, logo: form.logo });
        toast.success('Club ajouté');
      }
      setDialog({ open: false });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  const handleDelete = async () => {
    if (!deleteClub) return;
    try {
      await apiDelete(`${endpoint}?nom=${encodeURIComponent(deleteClub)}`);
      toast.success('Club supprimé');
      setDeleteClub(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Clubs adverses
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Équipes adverses de ce club et leurs logos, affichés sur les cartes de match.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter
          </Button>
        </div>

        {isLoading ? (
          <LoadingSpinner size={24} text="Chargement..." className="py-4" />
        ) : (
          <>
            {clubs.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un club..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-9"
                />
                {search && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearch('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-muted-foreground text-sm py-2">
                  {search ? 'Aucun résultat trouvé' : 'Aucun club adverse enregistré'}
                </p>
              ) : (
                filtered.map((club) => (
                  <div
                    key={club.nom}
                    className="flex items-center justify-between p-2 rounded-md border bg-card text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {club.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={club.logo}
                          alt={club.nom}
                          className="w-8 h-8 rounded-full object-cover border shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <p className="font-medium truncate">{club.nom}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(club)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteClub(club.nom)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.club ? 'Modifier le club' : 'Ajouter un club'}</DialogTitle>
            <DialogDescription>
              {dialog.club ? 'Modifiez les informations du club adverse' : 'Ajoutez un nouveau club adverse à la liste'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="opponent-club-nom">Nom *</Label>
              <Input id="opponent-club-nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Nom du club" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opponent-club-logo">URL du logo *</Label>
              <Input
                id="opponent-club-logo"
                value={form.logo}
                onChange={(e) => setForm({ ...form, logo: e.target.value })}
                placeholder="https://..."
              />
            </div>
            {form.logo && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.logo}
                  alt="Aperçu"
                  className="w-16 h-16 rounded-full object-cover border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <p className="text-xs text-muted-foreground">Aperçu</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>
              Annuler
            </Button>
            <Button onClick={handleSave}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteClub} onOpenChange={(open) => !open && setDeleteClub(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le club ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le club &quot;{deleteClub}&quot; ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
