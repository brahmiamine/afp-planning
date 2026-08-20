'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, X, MapPin } from 'lucide-react';
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
import { useStades, type Stade } from '@/app/hooks/useStades';

export function StadesTab() {
  const { stades, isLoading, reload } = useStades();
  const [dialog, setDialog] = useState<{ open: boolean; stade?: Stade }>({ open: false });
  const [deleteStade, setDeleteStade] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: '', adresse: '', googleMapsUrl: '' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return stades;
    const searchLower = search.toLowerCase();
    return stades.filter((s) => s.nom.toLowerCase().includes(searchLower) || (s.adresse && s.adresse.toLowerCase().includes(searchLower)));
  }, [stades, search]);

  const handleOpenDialog = (stade?: Stade) => {
    if (stade) {
      setForm({ nom: stade.nom, adresse: stade.adresse || '', googleMapsUrl: stade.googleMapsUrl });
      setDialog({ open: true, stade });
    } else {
      setForm({ nom: '', adresse: '', googleMapsUrl: '' });
      setDialog({ open: true });
    }
  };

  const handleSave = async () => {
    try {
      if (!form.nom.trim()) {
        toast.error('Le nom est requis');
        return;
      }
      if (!form.googleMapsUrl.trim()) {
        toast.error("L'URL Google Maps est requise");
        return;
      }

      if (dialog.stade) {
        await apiPut('/api/stades', {
          oldNom: dialog.stade.nom,
          nom: form.nom,
          adresse: form.adresse || null,
          googleMapsUrl: form.googleMapsUrl,
        });
        toast.success('Stade mis à jour');
      } else {
        await apiPost('/api/stades', { nom: form.nom, adresse: form.adresse || null, googleMapsUrl: form.googleMapsUrl });
        toast.success('Stade ajouté');
      }
      setDialog({ open: false });
      reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  const handleDelete = async () => {
    if (!deleteStade) return;
    try {
      await apiDelete(`/api/stades?nom=${encodeURIComponent(deleteStade)}`);
      toast.success('Stade supprimé');
      setDeleteStade(null);
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
                <MapPin className="h-5 w-5" />
                Stades
              </CardTitle>
              <CardDescription>Gérez la liste des stades et leurs informations</CardDescription>
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
                placeholder="Rechercher un stade..."
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
              <p className="text-muted-foreground text-center py-8">{search ? 'Aucun résultat trouvé' : 'Aucun stade enregistré'}</p>
            ) : (
              filtered.map((stade) => (
                <div
                  key={stade.nom}
                  className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{stade.nom}</p>
                    {stade.adresse && <p className="text-sm text-muted-foreground mt-1">{stade.adresse}</p>}
                    {stade.googleMapsUrl && (
                      <a
                        href={stade.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        Voir sur Google Maps
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(stade)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteStade(stade.nom)}>
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
            <DialogTitle>{dialog.stade ? 'Modifier le stade' : 'Ajouter un stade'}</DialogTitle>
            <DialogDescription>
              {dialog.stade ? 'Modifiez les informations du stade' : 'Ajoutez un nouveau stade à la liste'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stade-nom">Nom *</Label>
              <Input id="stade-nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Nom du stade" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stade-adresse">Adresse</Label>
              <Input
                id="stade-adresse"
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                placeholder="2 Rue Jean Cocteau, 75018 Paris"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stade-googlemaps">URL Google Maps *</Label>
              <Input
                id="stade-googlemaps"
                value={form.googleMapsUrl}
                onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })}
                placeholder="https://maps.app.goo.gl/..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>
              Annuler
            </Button>
            <Button onClick={handleSave}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteStade} onOpenChange={(open) => !open && setDeleteStade(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le stade ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le stade &quot;{deleteStade}&quot; ? Cette action est irréversible.
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
