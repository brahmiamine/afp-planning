'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, X, Tag } from 'lucide-react';
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
import { useCategories } from '@/app/hooks/useCategories';

export function CategoriesTab() {
  const { categories, isLoading, reload } = useCategories();
  const [dialog, setDialog] = useState<{ open: boolean; category?: string }>({ open: false });
  const [deleteCategory, setDeleteCategory] = useState<string | null>(null);
  const [form, setForm] = useState({ value: '' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const searchLower = search.toLowerCase();
    return categories.filter((c) => c.toLowerCase().includes(searchLower));
  }, [categories, search]);

  const handleOpenDialog = (category?: string) => {
    if (category) {
      setForm({ value: category });
      setDialog({ open: true, category });
    } else {
      setForm({ value: '' });
      setDialog({ open: true });
    }
  };

  const handleSave = async () => {
    try {
      if (!form.value.trim()) {
        toast.error('La catégorie est requise');
        return;
      }

      if (dialog.category) {
        await apiPut('/api/categories', { oldValue: dialog.category, newValue: form.value });
        toast.success('Catégorie mise à jour');
      } else {
        await apiPost('/api/categories', { value: form.value });
        toast.success('Catégorie ajoutée');
      }
      setDialog({ open: false });
      reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  const handleDelete = async () => {
    if (!deleteCategory) return;
    try {
      await apiDelete(`/api/categories?value=${encodeURIComponent(deleteCategory)}`);
      toast.success('Catégorie supprimée');
      setDeleteCategory(null);
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
                <Tag className="h-5 w-5" />
                Catégories
              </CardTitle>
              <CardDescription>Gérez les catégories d&apos;âge des équipes</CardDescription>
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
                placeholder="Rechercher une catégorie..."
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
              <p className="text-muted-foreground text-center py-8">{search ? 'Aucun résultat trouvé' : 'Aucune catégorie enregistrée'}</p>
            ) : (
              filtered.map((category) => (
                <div
                  key={category}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <p className="font-medium text-foreground">{category}</p>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(category)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteCategory(category)}>
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
            <DialogTitle>{dialog.category ? 'Modifier la catégorie' : 'Ajouter une catégorie'}</DialogTitle>
            <DialogDescription>
              {dialog.category ? 'Modifiez le nom de la catégorie' : 'Ajoutez une nouvelle catégorie à la liste'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-value">Catégorie *</Label>
              <Input
                id="category-value"
                value={form.value}
                onChange={(e) => setForm({ value: e.target.value })}
                placeholder="U10 A"
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

      <AlertDialog open={!!deleteCategory} onOpenChange={(open) => !open && setDeleteCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la catégorie ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la catégorie &quot;{deleteCategory}&quot; ? Cette action est irréversible.
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
