'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, X, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
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
import { apiPost, apiPut, apiDelete } from '@/lib/utils/api';
import { toast } from 'sonner';
import { useClubs, type Club } from '@/app/hooks/useClubs';

export function ClubsTab() {
  const { clubs, isLoading, reload } = useClubs();
  const [dialog, setDialog] = useState<{ open: boolean; club?: Club }>({ open: false });
  const [deleteClub, setDeleteClub] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: '', logo: '' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return clubs;
    const searchLower = search.toLowerCase();
    return clubs.filter((c) => c.nom.toLowerCase().includes(searchLower));
  }, [clubs, search]);

  const handleOpenDialog = (club?: Club) => {
    if (club) {
      setForm({ nom: club.nom, logo: club.logo });
      setDialog({ open: true, club });
    } else {
      setForm({ nom: '', logo: '' });
      setDialog({ open: true });
    }
  };

  const handleSave = async () => {
    try {
      if (!form.nom.trim()) {
        toast.error('Le nom est requis');
        return;
      }
      if (!form.logo.trim()) {
        toast.error('Le logo est requis');
        return;
      }

      if (dialog.club) {
        await apiPut('/api/clubs', { oldNom: dialog.club.nom, nom: form.nom, logo: form.logo });
        toast.success('Club mis à jour');
      } else {
        await apiPost('/api/clubs', { nom: form.nom, logo: form.logo });
        toast.success('Club ajouté');
      }
      setDialog({ open: false });
      reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  const handleDelete = async () => {
    if (!deleteClub) return;
    try {
      await apiDelete(`/api/clubs?nom=${encodeURIComponent(deleteClub)}`);
      toast.success('Club supprimé');
      setDeleteClub(null);
      reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  if (isLoading) {
    return <LoadingSpinner size={40} text="Chargement..." className="py-20" />;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Clubs
              </CardTitle>
              <CardDescription>Gérez la liste des clubs et leurs logos</CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearch('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{search ? 'Aucun résultat trouvé' : 'Aucun club enregistré'}</p>
            ) : (
              filtered.map((club) => (
                <div
                  key={club.nom}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {club.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={club.logo}
                        alt={club.nom}
                        className="w-10 h-10 rounded-full object-cover border shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <p className="font-medium text-foreground truncate">{club.nom}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
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
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.club ? 'Modifier le club' : 'Ajouter un club'}</DialogTitle>
            <DialogDescription>{dialog.club ? 'Modifiez les informations du club' : 'Ajoutez un nouveau club à la liste'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="club-nom">Nom *</Label>
              <Input id="club-nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Nom du club" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="club-logo">URL du logo *</Label>
              <Input
                id="club-logo"
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
                  alt="Preview"
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
