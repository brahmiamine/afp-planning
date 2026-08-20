'use client';

import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, Pencil, Trash2, Phone, Search, X } from 'lucide-react';
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
import {
  formatIndisponibiliteLabel,
  getOfficielIndispoDisplay,
  normalizeIndisponibilites,
  toDateKeyFromInput,
  type OfficielIndisponibilite,
  type OfficielIndisponibiliteType,
} from '@/lib/utils/officiel-availability';

export interface ReferentialPerson {
  nom: string;
  telephone?: string;
  indisponibilites?: OfficielIndisponibilite[];
}

interface PersonReferentialTabProps {
  icon: LucideIcon;
  title: string;
  description: string;
  searchPlaceholder: string;
  emptyLabel: string;
  /** Nom singulier masculin ("officiel", "encadrant", "accompagnateur") — utilisé pour les titres/messages générés. */
  singularLabel: string;
  idPrefix: string;
  apiEndpoint: string;
  people: ReferentialPerson[];
  isLoading: boolean;
  reload: () => void;
}

const EMPTY_INDISPO_FORM = {
  type: 'day-range' as OfficielIndisponibiliteType,
  startDateInput: '',
  endDateInput: '',
  dateInput: '',
  startTime: '',
  endTime: '',
};

export function PersonReferentialTab({
  icon: Icon,
  title,
  description,
  searchPlaceholder,
  emptyLabel,
  singularLabel,
  idPrefix,
  apiEndpoint,
  people,
  isLoading,
  reload,
}: PersonReferentialTabProps) {
  const [dialog, setDialog] = useState<{ open: boolean; person?: ReferentialPerson }>({ open: false });
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: '', telephone: '' });
  const [indisponibilites, setIndisponibilites] = useState<OfficielIndisponibilite[]>([]);
  const [indispoForm, setIndispoForm] = useState(EMPTY_INDISPO_FORM);
  const [search, setSearch] = useState('');

  const filteredPeople = useMemo(() => {
    if (!search.trim()) return people;
    const searchLower = search.toLowerCase();
    return people.filter((p) => p.nom.toLowerCase().includes(searchLower) || (p.telephone && p.telephone.toLowerCase().includes(searchLower)));
  }, [people, search]);

  const handleOpenDialog = (person?: ReferentialPerson) => {
    if (person) {
      setForm({ nom: person.nom, telephone: person.telephone || '' });
      setIndisponibilites(normalizeIndisponibilites(person.indisponibilites));
      setDialog({ open: true, person });
    } else {
      setForm({ nom: '', telephone: '' });
      setIndisponibilites([]);
      setDialog({ open: true });
    }
    setIndispoForm(EMPTY_INDISPO_FORM);
  };

  const handleAddIndisponibilite = () => {
    if (indispoForm.type === 'day-range') {
      const dateStart = toDateKeyFromInput(indispoForm.startDateInput);
      const dateEnd = toDateKeyFromInput(indispoForm.endDateInput || indispoForm.startDateInput);

      if (!dateStart || !dateEnd) {
        toast.error('Les dates de début et fin sont requises');
        return;
      }

      const newRule: OfficielIndisponibilite = {
        id: `day-range-${dateStart}-${dateEnd}-${Date.now()}`,
        type: 'day-range',
        dateStart,
        dateEnd,
      };

      setIndisponibilites((prev) => normalizeIndisponibilites([...prev, newRule]));
      setIndispoForm((prev) => ({ ...prev, startDateInput: '', endDateInput: '' }));
      return;
    }

    const date = toDateKeyFromInput(indispoForm.dateInput);
    if (!date) {
      toast.error('La date du créneau horaire est requise');
      return;
    }

    if (!indispoForm.startTime && !indispoForm.endTime) {
      toast.error('Ajoutez au moins une heure de début ou de fin');
      return;
    }

    const newRule: OfficielIndisponibilite = {
      id: `time-slot-${date}-${indispoForm.startTime || '--'}-${indispoForm.endTime || '--'}-${Date.now()}`,
      type: 'time-slot',
      date,
      ...(indispoForm.startTime ? { startTime: indispoForm.startTime } : {}),
      ...(indispoForm.endTime ? { endTime: indispoForm.endTime } : {}),
    };

    setIndisponibilites((prev) => normalizeIndisponibilites([...prev, newRule]));
    setIndispoForm((prev) => ({ ...prev, dateInput: '', startTime: '', endTime: '' }));
  };

  const handleRemoveIndisponibilite = (ruleId: string) => {
    setIndisponibilites((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const handleSave = async () => {
    try {
      if (!form.nom.trim()) {
        toast.error('Le nom est requis');
        return;
      }

      if (dialog.person) {
        await apiPut(apiEndpoint, {
          oldNom: dialog.person.nom,
          nom: form.nom,
          telephone: form.telephone || undefined,
          indisponibilites,
        });
        toast.success(`${singularLabel[0]?.toUpperCase()}${singularLabel.slice(1)} mis à jour`);
      } else {
        await apiPost(apiEndpoint, {
          nom: form.nom,
          telephone: form.telephone || undefined,
          indisponibilites,
        });
        toast.success(`${singularLabel[0]?.toUpperCase()}${singularLabel.slice(1)} ajouté`);
      }
      setDialog({ open: false });
      reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur', { description: errorMessage });
    }
  };

  const handleDelete = async () => {
    if (!deleteName) return;
    try {
      await apiDelete(`${apiEndpoint}?nom=${encodeURIComponent(deleteName)}`);
      toast.success(`${singularLabel[0]?.toUpperCase()}${singularLabel.slice(1)} supprimé`);
      setDeleteName(null);
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
                <Icon className="h-5 w-5" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
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
                placeholder={searchPlaceholder}
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
            {filteredPeople.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{search ? 'Aucun résultat trouvé' : emptyLabel}</p>
            ) : (
              filteredPeople.map((person) => {
                const indispoDisplay = getOfficielIndispoDisplay(person.indisponibilites);

                return (
                  <div
                    key={person.nom}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{person.nom}</p>
                      {person.telephone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Phone className="h-3 w-3" />
                          {person.telephone}
                        </p>
                      )}
                      {indispoDisplay.label && (
                        <p className={`text-xs mt-1 ${indispoDisplay.mode === 'current' ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {indispoDisplay.label}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(person)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteName(person.nom)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.person ? `Modifier l'${singularLabel}` : `Ajouter un ${singularLabel}`}</DialogTitle>
            <DialogDescription>
              {dialog.person ? `Modifiez les informations de l'${singularLabel}` : `Ajoutez un nouvel ${singularLabel} à la liste`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-nom`}>Nom *</Label>
              <Input
                id={`${idPrefix}-nom`}
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                placeholder={`Nom de l'${singularLabel}`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-telephone`}>Téléphone</Label>
              <Input
                id={`${idPrefix}-telephone`}
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                placeholder="06.12.34.56.78"
              />
            </div>

            <div className="space-y-3 border rounded-lg p-3">
              <Label className="text-sm font-semibold">Indisponibilités</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-indispo-type`}>Type</Label>
                  <select
                    id={`${idPrefix}-indispo-type`}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={indispoForm.type}
                    onChange={(e) => {
                      const value = e.target.value as OfficielIndisponibiliteType;
                      setIndispoForm((prev) => ({ ...prev, type: value }));
                    }}
                  >
                    <option value="day-range">Plage de jours</option>
                    <option value="time-slot">Plage horaire (1 jour)</option>
                  </select>
                </div>

                {indispoForm.type === 'day-range' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`${idPrefix}-indispo-start-date`}>Date début</Label>
                      <Input
                        id={`${idPrefix}-indispo-start-date`}
                        type="date"
                        value={indispoForm.startDateInput}
                        onChange={(e) => setIndispoForm((prev) => ({ ...prev, startDateInput: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${idPrefix}-indispo-end-date`}>Date fin</Label>
                      <Input
                        id={`${idPrefix}-indispo-end-date`}
                        type="date"
                        value={indispoForm.endDateInput}
                        onChange={(e) => setIndispoForm((prev) => ({ ...prev, endDateInput: e.target.value }))}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`${idPrefix}-indispo-date`}>Date</Label>
                    <Input
                      id={`${idPrefix}-indispo-date`}
                      type="date"
                      value={indispoForm.dateInput}
                      onChange={(e) => setIndispoForm((prev) => ({ ...prev, dateInput: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {indispoForm.type === 'time-slot' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${idPrefix}-indispo-start`}>Début</Label>
                    <Input
                      id={`${idPrefix}-indispo-start`}
                      type="time"
                      value={indispoForm.startTime}
                      onChange={(e) => setIndispoForm((prev) => ({ ...prev, startTime: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${idPrefix}-indispo-end`}>Fin</Label>
                    <Input
                      id={`${idPrefix}-indispo-end`}
                      type="time"
                      value={indispoForm.endTime}
                      onChange={(e) => setIndispoForm((prev) => ({ ...prev, endTime: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={handleAddIndisponibilite}>
                  Ajouter l&apos;indisponibilité
                </Button>
              </div>

              {indisponibilites.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune indisponibilité enregistrée.</p>
              ) : (
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {indisponibilites.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                      <span>{formatIndisponibiliteLabel(rule)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveIndisponibilite(rule.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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

      <AlertDialog open={!!deleteName} onOpenChange={(open) => !open && setDeleteName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;{singularLabel} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l&apos;{singularLabel} &quot;{deleteName}&quot; ? Cette action est irréversible.
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
