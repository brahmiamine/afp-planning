'use client';

import { useState, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { useMatches } from '../hooks/useMatches';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { useOfficiels, type Officiel } from '../hooks/useOfficiels';
import { useCategories } from '../hooks/useCategories';
import { useClubs, type Club } from '../hooks/useClubs';
import { useStades, type Stade } from '../hooks/useStades';
import { apiPost, apiPut, apiDelete } from '../lib/utils/api';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, Tag, Building2, MapPin, Phone, Search, X } from 'lucide-react';
import { LoadingSpinner } from '../components/ui/loading-spinner';

export default function ConfigurationPage() {
  const { matchesData } = useMatches();
  const { officiels, isLoading: isLoadingOfficiels, reload: reloadOfficiels } = useOfficiels();
  const { categories, isLoading: isLoadingCategories, reload: reloadCategories } = useCategories();
  const { clubs, isLoading: isLoadingClubs, reload: reloadClubs } = useClubs();
  const { stades, isLoading: isLoadingStades, reload: reloadStades } = useStades();

  // États pour les dialogs
  const [officielDialog, setOfficielDialog] = useState<{ open: boolean; officiel?: Officiel }>({ open: false });
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category?: string }>({ open: false });
  const [clubDialog, setClubDialog] = useState<{ open: boolean; club?: Club }>({ open: false });
  const [stadeDialog, setStadeDialog] = useState<{ open: boolean; stade?: Stade }>({ open: false });

  // États pour les confirmations de suppression
  const [deleteOfficiel, setDeleteOfficiel] = useState<string | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<string | null>(null);
  const [deleteClub, setDeleteClub] = useState<string | null>(null);
  const [deleteStade, setDeleteStade] = useState<string | null>(null);

  // États pour les formulaires
  const [officielForm, setOfficielForm] = useState({ nom: '', telephone: '' });
  const [categoryForm, setCategoryForm] = useState({ value: '' });
  const [clubForm, setClubForm] = useState({ nom: '', logo: '' });
  const [stadeForm, setStadeForm] = useState({ nom: '', adresse: '', googleMapsUrl: '' });

  // États pour les recherches
  const [searchOfficiel, setSearchOfficiel] = useState('');
  const [searchCategory, setSearchCategory] = useState('');
  const [searchClub, setSearchClub] = useState('');
  const [searchStade, setSearchStade] = useState('');

  const isLoading = isLoadingOfficiels || isLoadingCategories || isLoadingClubs || isLoadingStades;

  // Filtrage des résultats
  const filteredOfficiels = useMemo(() => {
    if (!searchOfficiel.trim()) return officiels;
    const searchLower = searchOfficiel.toLowerCase();
    return officiels.filter(
      (o) =>
        o.nom.toLowerCase().includes(searchLower) ||
        (o.telephone && o.telephone.toLowerCase().includes(searchLower))
    );
  }, [officiels, searchOfficiel]);

  const filteredCategories = useMemo(() => {
    if (!searchCategory.trim()) return categories;
    const searchLower = searchCategory.toLowerCase();
    return categories.filter((c) => c.toLowerCase().includes(searchLower));
  }, [categories, searchCategory]);

  const filteredClubs = useMemo(() => {
    if (!searchClub.trim()) return clubs;
    const searchLower = searchClub.toLowerCase();
    return clubs.filter((c) => c.nom.toLowerCase().includes(searchLower));
  }, [clubs, searchClub]);

  const filteredStades = useMemo(() => {
    if (!searchStade.trim()) return stades;
    const searchLower = searchStade.toLowerCase();
    return stades.filter(
      (s) =>
        s.nom.toLowerCase().includes(searchLower) ||
        (s.adresse && s.adresse.toLowerCase().includes(searchLower))
    );
  }, [stades, searchStade]);

  // Gestion des officiels
  const handleOpenOfficielDialog = (officiel?: Officiel) => {
    if (officiel) {
      setOfficielForm({ nom: officiel.nom, telephone: officiel.telephone || '' });
      setOfficielDialog({ open: true, officiel });
    } else {
      setOfficielForm({ nom: '', telephone: '' });
      setOfficielDialog({ open: true });
    }
  };

  const handleSaveOfficiel = async () => {
    try {
      if (!officielForm.nom.trim()) {
        toast.error('Le nom est requis');
        return;
      }

      if (officielDialog.officiel) {
        // Mise à jour
        await apiPut('/api/officiels', {
          oldNom: officielDialog.officiel.nom,
          nom: officielForm.nom,
          telephone: officielForm.telephone || undefined,
        });
        toast.success('Officiel mis à jour');
      } else {
        // Ajout
        await apiPost('/api/officiels', {
          nom: officielForm.nom,
          telephone: officielForm.telephone || undefined,
        });
        toast.success('Officiel ajouté');
      }
      setOfficielDialog({ open: false });
      reloadOfficiels();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  const handleDeleteOfficiel = async () => {
    if (!deleteOfficiel) return;
    try {
      await apiDelete(`/api/officiels?nom=${encodeURIComponent(deleteOfficiel)}`);
      toast.success('Officiel supprimé');
      setDeleteOfficiel(null);
      reloadOfficiels();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  // Gestion des catégories
  const handleOpenCategoryDialog = (category?: string) => {
    if (category) {
      setCategoryForm({ value: category });
      setCategoryDialog({ open: true, category });
    } else {
      setCategoryForm({ value: '' });
      setCategoryDialog({ open: true });
    }
  };

  const handleSaveCategory = async () => {
    try {
      if (!categoryForm.value.trim()) {
        toast.error('La catégorie est requise');
        return;
      }

      if (categoryDialog.category) {
        // Mise à jour
        await apiPut('/api/categories', {
          oldValue: categoryDialog.category,
          newValue: categoryForm.value,
        });
        toast.success('Catégorie mise à jour');
      } else {
        // Ajout
        await apiPost('/api/categories', {
          value: categoryForm.value,
        });
        toast.success('Catégorie ajoutée');
      }
      setCategoryDialog({ open: false });
      reloadCategories();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategory) return;
    try {
      await apiDelete(`/api/categories?value=${encodeURIComponent(deleteCategory)}`);
      toast.success('Catégorie supprimée');
      setDeleteCategory(null);
      reloadCategories();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  // Gestion des clubs
  const handleOpenClubDialog = (club?: Club) => {
    if (club) {
      setClubForm({ nom: club.nom, logo: club.logo });
      setClubDialog({ open: true, club });
    } else {
      setClubForm({ nom: '', logo: '' });
      setClubDialog({ open: true });
    }
  };

  const handleSaveClub = async () => {
    try {
      if (!clubForm.nom.trim()) {
        toast.error('Le nom est requis');
        return;
      }
      if (!clubForm.logo.trim()) {
        toast.error('Le logo est requis');
        return;
      }

      if (clubDialog.club) {
        // Mise à jour
        await apiPut('/api/clubs', {
          oldNom: clubDialog.club.nom,
          nom: clubForm.nom,
          logo: clubForm.logo,
        });
        toast.success('Club mis à jour');
      } else {
        // Ajout
        await apiPost('/api/clubs', {
          nom: clubForm.nom,
          logo: clubForm.logo,
        });
        toast.success('Club ajouté');
      }
      setClubDialog({ open: false });
      reloadClubs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  const handleDeleteClub = async () => {
    if (!deleteClub) return;
    try {
      await apiDelete(`/api/clubs?nom=${encodeURIComponent(deleteClub)}`);
      toast.success('Club supprimé');
      setDeleteClub(null);
      reloadClubs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  // Gestion des stades
  const handleOpenStadeDialog = (stade?: Stade) => {
    if (stade) {
      setStadeForm({
        nom: stade.nom,
        adresse: stade.adresse || '',
        googleMapsUrl: stade.googleMapsUrl,
      });
      setStadeDialog({ open: true, stade });
    } else {
      setStadeForm({ nom: '', adresse: '', googleMapsUrl: '' });
      setStadeDialog({ open: true });
    }
  };

  const handleSaveStade = async () => {
    try {
      if (!stadeForm.nom.trim()) {
        toast.error('Le nom est requis');
        return;
      }
      if (!stadeForm.googleMapsUrl.trim()) {
        toast.error('L\'URL Google Maps est requise');
        return;
      }

      if (stadeDialog.stade) {
        // Mise à jour
        await apiPut('/api/stades', {
          oldNom: stadeDialog.stade.nom,
          nom: stadeForm.nom,
          adresse: stadeForm.adresse || null,
          googleMapsUrl: stadeForm.googleMapsUrl,
        });
        toast.success('Stade mis à jour');
      } else {
        // Ajout
        await apiPost('/api/stades', {
          nom: stadeForm.nom,
          adresse: stadeForm.adresse || null,
          googleMapsUrl: stadeForm.googleMapsUrl,
        });
        toast.success('Stade ajouté');
      }
      setStadeDialog({ open: false });
      reloadStades();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  const handleDeleteStade = async () => {
    if (!deleteStade) return;
    try {
      await apiDelete(`/api/stades?nom=${encodeURIComponent(deleteStade)}`);
      toast.success('Stade supprimé');
      setDeleteStade(null);
      reloadStades();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header club={matchesData?.club} onScrapeComplete={() => {}} />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Configuration</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Gérez les officiels, catégories, clubs et stades
          </p>
        </div>

        {isLoading ? (
          <LoadingSpinner size={48} text="Chargement..." className="py-20" />
        ) : (
          <Tabs defaultValue="officiels" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6">
              <TabsTrigger value="officiels" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Officiels</span>
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">Catégories</span>
              </TabsTrigger>
              <TabsTrigger value="clubs" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clubs</span>
              </TabsTrigger>
              <TabsTrigger value="stades" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">Stades</span>
              </TabsTrigger>
            </TabsList>

            {/* Section Officiels */}
            <TabsContent value="officiels">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Officiels
                      </CardTitle>
                      <CardDescription>
                        Gérez la liste des officiels et leurs numéros de téléphone
                      </CardDescription>
                    </div>
                    <Button onClick={() => handleOpenOfficielDialog()} size="sm">
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
                        placeholder="Rechercher un officiel..."
                        value={searchOfficiel}
                        onChange={(e) => setSearchOfficiel(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchOfficiel && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchOfficiel('')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredOfficiels.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        {searchOfficiel ? 'Aucun résultat trouvé' : 'Aucun officiel enregistré'}
                      </p>
                    ) : (
                      filteredOfficiels.map((officiel) => (
                        <div
                          key={officiel.nom}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{officiel.nom}</p>
                            {officiel.telephone && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                <Phone className="h-3 w-3" />
                                {officiel.telephone}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenOfficielDialog(officiel)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteOfficiel(officiel.nom)}
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
            </TabsContent>

            {/* Section Catégories */}
            <TabsContent value="categories">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        Catégories
                      </CardTitle>
                      <CardDescription>
                        Gérez les catégories d'âge des équipes
                      </CardDescription>
                    </div>
                    <Button onClick={() => handleOpenCategoryDialog()} size="sm">
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
                        value={searchCategory}
                        onChange={(e) => setSearchCategory(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchCategory && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchCategory('')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredCategories.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        {searchCategory ? 'Aucun résultat trouvé' : 'Aucune catégorie enregistrée'}
                      </p>
                    ) : (
                      filteredCategories.map((category) => (
                        <div
                          key={category}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <p className="font-medium text-foreground">{category}</p>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenCategoryDialog(category)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteCategory(category)}
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
            </TabsContent>

            {/* Section Clubs */}
            <TabsContent value="clubs">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Clubs
                      </CardTitle>
                      <CardDescription>
                        Gérez la liste des clubs et leurs logos
                      </CardDescription>
                    </div>
                    <Button onClick={() => handleOpenClubDialog()} size="sm">
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
                        value={searchClub}
                        onChange={(e) => setSearchClub(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchClub && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchClub('')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredClubs.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        {searchClub ? 'Aucun résultat trouvé' : 'Aucun club enregistré'}
                      </p>
                    ) : (
                      filteredClubs.map((club) => (
                        <div
                          key={club.nom}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {club.logo && (
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
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenClubDialog(club)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteClub(club.nom)}
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
            </TabsContent>

            {/* Section Stades */}
            <TabsContent value="stades">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Stades
                      </CardTitle>
                      <CardDescription>
                        Gérez la liste des stades et leurs informations
                      </CardDescription>
                    </div>
                    <Button onClick={() => handleOpenStadeDialog()} size="sm">
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
                        value={searchStade}
                        onChange={(e) => setSearchStade(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchStade && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchStade('')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredStades.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        {searchStade ? 'Aucun résultat trouvé' : 'Aucun stade enregistré'}
                      </p>
                    ) : (
                      filteredStades.map((stade) => (
                        <div
                          key={stade.nom}
                          className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground">{stade.nom}</p>
                            {stade.adresse && (
                              <p className="text-sm text-muted-foreground mt-1">{stade.adresse}</p>
                            )}
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
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenStadeDialog(stade)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteStade(stade.nom)}
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
            </TabsContent>
          </Tabs>
        )}

        {/* Dialog Officiel */}
        <Dialog open={officielDialog.open} onOpenChange={(open) => setOfficielDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {officielDialog.officiel ? 'Modifier l\'officiel' : 'Ajouter un officiel'}
              </DialogTitle>
              <DialogDescription>
                {officielDialog.officiel
                  ? 'Modifiez les informations de l\'officiel'
                  : 'Ajoutez un nouvel officiel à la liste'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="officiel-nom">Nom *</Label>
                <Input
                  id="officiel-nom"
                  value={officielForm.nom}
                  onChange={(e) => setOfficielForm({ ...officielForm, nom: e.target.value })}
                  placeholder="Nom de l'officiel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="officiel-telephone">Téléphone</Label>
                <Input
                  id="officiel-telephone"
                  value={officielForm.telephone}
                  onChange={(e) => setOfficielForm({ ...officielForm, telephone: e.target.value })}
                  placeholder="06.12.34.56.78"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOfficielDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveOfficiel}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Catégorie */}
        <Dialog open={categoryDialog.open} onOpenChange={(open) => setCategoryDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {categoryDialog.category ? 'Modifier la catégorie' : 'Ajouter une catégorie'}
              </DialogTitle>
              <DialogDescription>
                {categoryDialog.category
                  ? 'Modifiez le nom de la catégorie'
                  : 'Ajoutez une nouvelle catégorie à la liste'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category-value">Catégorie *</Label>
                <Input
                  id="category-value"
                  value={categoryForm.value}
                  onChange={(e) => setCategoryForm({ value: e.target.value })}
                  placeholder="U10 A"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCategoryDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveCategory}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Club */}
        <Dialog open={clubDialog.open} onOpenChange={(open) => setClubDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {clubDialog.club ? 'Modifier le club' : 'Ajouter un club'}
              </DialogTitle>
              <DialogDescription>
                {clubDialog.club
                  ? 'Modifiez les informations du club'
                  : 'Ajoutez un nouveau club à la liste'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="club-nom">Nom *</Label>
                <Input
                  id="club-nom"
                  value={clubForm.nom}
                  onChange={(e) => setClubForm({ ...clubForm, nom: e.target.value })}
                  placeholder="Nom du club"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="club-logo">URL du logo *</Label>
                <Input
                  id="club-logo"
                  value={clubForm.logo}
                  onChange={(e) => setClubForm({ ...clubForm, logo: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              {clubForm.logo && (
                <div className="flex items-center gap-2">
                  <img
                    src={clubForm.logo}
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
              <Button variant="outline" onClick={() => setClubDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveClub}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Stade */}
        <Dialog open={stadeDialog.open} onOpenChange={(open) => setStadeDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {stadeDialog.stade ? 'Modifier le stade' : 'Ajouter un stade'}
              </DialogTitle>
              <DialogDescription>
                {stadeDialog.stade
                  ? 'Modifiez les informations du stade'
                  : 'Ajoutez un nouveau stade à la liste'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="stade-nom">Nom *</Label>
                <Input
                  id="stade-nom"
                  value={stadeForm.nom}
                  onChange={(e) => setStadeForm({ ...stadeForm, nom: e.target.value })}
                  placeholder="Nom du stade"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stade-adresse">Adresse</Label>
                <Input
                  id="stade-adresse"
                  value={stadeForm.adresse}
                  onChange={(e) => setStadeForm({ ...stadeForm, adresse: e.target.value })}
                  placeholder="2 Rue Jean Cocteau, 75018 Paris"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stade-googlemaps">URL Google Maps *</Label>
                <Input
                  id="stade-googlemaps"
                  value={stadeForm.googleMapsUrl}
                  onChange={(e) => setStadeForm({ ...stadeForm, googleMapsUrl: e.target.value })}
                  placeholder="https://maps.app.goo.gl/..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStadeDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveStade}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Alert Dialogs pour les suppressions */}
        <AlertDialog open={!!deleteOfficiel} onOpenChange={(open) => !open && setDeleteOfficiel(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer l'officiel ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer l'officiel "{deleteOfficiel}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteOfficiel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteCategory} onOpenChange={(open) => !open && setDeleteCategory(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer la catégorie ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer la catégorie "{deleteCategory}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteClub} onOpenChange={(open) => !open && setDeleteClub(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le club ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer le club "{deleteClub}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteClub} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteStade} onOpenChange={(open) => !open && setDeleteStade(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le stade ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer le stade "{deleteStade}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteStade} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
