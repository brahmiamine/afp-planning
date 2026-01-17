'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { useMatchExtras, MatchExtras } from '@/hooks/useMatchExtras';
import { useOfficiels } from '@/hooks/useOfficiels';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ContactListEditor } from '@/components/ui/contact-list-editor';
import { StadeCombobox } from '@/components/ui/stade-combobox';
import { useStades, Stade } from '@/hooks/useStades';
import { apiPut, apiDelete } from '@/lib/utils/api';
import { toast } from 'sonner';

interface EventEditorProps {
  event: Match | Entrainement | Plateau;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export const EventEditor = memo(function EventEditor({ 
  event, 
  onClose, 
  onSave,
  onDelete 
}: EventEditorProps) {
  const isMatch = 'localTeam' in event || 'competition' in event;
  const isMatchAmical = isMatch && (event as Match).type === 'amical';
  const isEntrainement = !isMatch && event.type === 'entrainement';
  const isPlateau = !isMatch && event.type === 'plateau';

  // Pour les matchs amicaux, utiliser les extras
  const { extras, save: saveExtras } = useMatchExtras(isMatchAmical ? event.id : undefined);
  const { officiels, reload: reloadOfficiels } = useOfficiels();
  const { stades } = useStades();

  // État pour les matchs amicaux (avec extras)
  const [matchExtras, setMatchExtras] = useState<MatchExtras>({
    id: event.id || '',
    confirmed: false,
    arbitreTouche: [],
    contactEncadrants: [],
    contactAccompagnateur: [],
  });

  // État pour les matchs amicaux (champs de base)
  const [matchData, setMatchData] = useState({
    date: (event as Match).date || '',
    time: (event as Match).time || '',
    localTeam: (event as Match).localTeam || '',
    awayTeam: (event as Match).awayTeam || '',
    competition: (event as Match).competition || '',
    venue: ((event as Match).venue || 'domicile') as 'domicile' | 'extérieur',
    horaireRendezVous: (event as Match).horaireRendezVous || '',
    stadium: (event as Match).details?.stadium || '',
    address: (event as Match).details?.address || '',
  });

  // État pour sélection de stade (match amical)
  const [selectedStade, setSelectedStade] = useState<Stade | null>(null);

  // État pour entraînement/plateau
  const [simpleEventData, setSimpleEventData] = useState({
    date: event.date || '',
    time: event.time || '',
    lieu: ('lieu' in event ? event.lieu : '') || '',
    encadrantNom: ('encadrant' in event ? event.encadrant.nom : '') || '',
    encadrantPrenom: ('encadrant' in event ? event.encadrant.prenom : '') || '',
  });

  // État pour sélection de stade (entraînement)
  const [selectedStadeEntrainement, setSelectedStadeEntrainement] = useState<Stade | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  // Quand un stade est sélectionné pour match amical, remplir les champs
  useEffect(() => {
    if (selectedStade) {
      setMatchData(prev => ({
        ...prev,
        stadium: selectedStade.nom,
        address: selectedStade.adresse || prev.address,
      }));
    }
  }, [selectedStade]);

  // Quand un stade est sélectionné pour entraînement, remplir le champ lieu
  useEffect(() => {
    if (selectedStadeEntrainement) {
      const lieuText = selectedStadeEntrainement.adresse 
        ? `${selectedStadeEntrainement.nom} - ${selectedStadeEntrainement.adresse}`
        : selectedStadeEntrainement.nom;
      setSimpleEventData(prev => ({
        ...prev,
        lieu: lieuText,
      }));
    }
  }, [selectedStadeEntrainement]);

  // Initialiser le stade sélectionné pour match amical quand les stades sont chargés
  useEffect(() => {
    if (isMatchAmical && stades.length > 0 && !selectedStade) {
      const match = event as Match;
      const stadiumName = match.details?.stadium || '';
      if (stadiumName) {
        const found = stades.find(s => s.nom === stadiumName);
        if (found) {
          setSelectedStade(found);
        }
      }
    }
  }, [isMatchAmical, stades, event, selectedStade]);

  // Initialiser le stade sélectionné pour entraînement quand les stades sont chargés
  useEffect(() => {
    if ((isEntrainement || isPlateau) && stades.length > 0 && !selectedStadeEntrainement) {
      const lieuValue = 'lieu' in event ? event.lieu : '';
      if (lieuValue) {
        const found = stades.find(s => lieuValue.includes(s.nom));
        if (found) {
          setSelectedStadeEntrainement(found);
        }
      }
    }
  }, [isEntrainement, isPlateau, stades, event, selectedStadeEntrainement]);

  // Charger les extras pour les matchs amicaux
  useEffect(() => {
    if (isMatchAmical && extras) {
      setMatchExtras({
        id: event.id || '',
        confirmed: extras.confirmed || false,
        arbitreTouche: Array.isArray(extras.arbitreTouche) ? extras.arbitreTouche : extras.arbitreTouche ? [extras.arbitreTouche] : [],
        contactEncadrants: Array.isArray(extras.contactEncadrants) ? extras.contactEncadrants : extras.contactEncadrants ? [extras.contactEncadrants] : [],
        contactAccompagnateur: Array.isArray(extras.contactAccompagnateur) ? extras.contactAccompagnateur : extras.contactAccompagnateur ? [extras.contactAccompagnateur] : [],
      });
    }
  }, [extras, isMatchAmical, event.id]);

  const handleAddOfficiel = useCallback(async (nom: string, telephone: string) => {
    await apiPut('/api/officiels', { nom, telephone });
    reloadOfficiels();
  }, [reloadOfficiels]);

  const handleSave = useCallback(async () => {
    try {
      if (isMatchAmical) {
        const match = event as Match;
        
        // Mettre à jour les données du match
        await apiPut('/api/matches-amicaux', {
          id: match.id,
          ...matchData,
          details: matchData.stadium || matchData.address ? {
            stadium: matchData.stadium,
            address: matchData.address,
            dateTime: `${matchData.date} - ${matchData.time}`,
            competition: matchData.competition,
            terrainType: '',
            itineraryLink: '',
            rawText: '',
          } : null,
        });

        // Mettre à jour les extras (officiels)
        if (match.id) {
          // Mettre à jour les numéros dans officiels.json
          const updatePromises: Promise<void>[] = [];

          // Vérifier tous les arbitres AFP
          matchExtras.arbitreTouche?.forEach((contact) => {
            if (contact.nom && contact.numero) {
              const officiel = officiels.find((o) => o.nom === contact.nom);
              if (!officiel?.telephone || officiel.telephone !== contact.numero) {
                updatePromises.push(
                  apiPut('/api/officiels', { nom: contact.nom, telephone: contact.numero }).then(() => {})
                );
              }
            }
          });

          // Vérifier tous les encadrants
          matchExtras.contactEncadrants?.forEach((contact) => {
            if (contact.nom && contact.numero) {
              const officiel = officiels.find((o) => o.nom === contact.nom);
              if (!officiel?.telephone || officiel.telephone !== contact.numero) {
                updatePromises.push(
                  apiPut('/api/officiels', { nom: contact.nom, telephone: contact.numero }).then(() => {})
                );
              }
            }
          });

          // Vérifier tous les accompagnateurs
          matchExtras.contactAccompagnateur?.forEach((contact) => {
            if (contact.nom && contact.numero) {
              const officiel = officiels.find((o) => o.nom === contact.nom);
              if (!officiel?.telephone || officiel.telephone !== contact.numero) {
                updatePromises.push(
                  apiPut('/api/officiels', { nom: contact.nom, telephone: contact.numero }).then(() => {})
                );
              }
            }
          });

          await Promise.all(updatePromises);
          if (updatePromises.length > 0) {
            reloadOfficiels();
          }

          // Sauvegarder les extras
          await saveExtras(matchExtras);
        }
      } else if (isEntrainement) {
        await apiPut('/api/entrainements', {
          id: event.id,
          date: simpleEventData.date,
          time: simpleEventData.time,
          lieu: simpleEventData.lieu,
          encadrant: {
            nom: simpleEventData.encadrantNom,
            prenom: simpleEventData.encadrantPrenom,
          },
        });
      } else if (isPlateau) {
        await apiPut('/api/plateaux', {
          id: event.id,
          date: simpleEventData.date,
          time: simpleEventData.time,
          lieu: simpleEventData.lieu,
          encadrant: {
            nom: simpleEventData.encadrantNom,
            prenom: simpleEventData.encadrantPrenom,
          },
        });
      }

      toast.success('Événement modifié avec succès');
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
      toast.error('Erreur lors de la modification de l\'événement');
    }
  }, [
    isMatchAmical,
    isEntrainement,
    isPlateau,
    event,
    matchData,
    matchExtras,
    simpleEventData,
    officiels,
    saveExtras,
    reloadOfficiels,
    onSave,
    onClose,
  ]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
      return;
    }

    setIsDeleting(true);
    try {
      let endpoint = '';
      if (isMatchAmical) {
        endpoint = `/api/matches-amicaux?id=${encodeURIComponent(event.id || '')}`;
      } else if (isEntrainement) {
        endpoint = `/api/entrainements?id=${encodeURIComponent(event.id || '')}`;
      } else if (isPlateau) {
        endpoint = `/api/plateaux?id=${encodeURIComponent(event.id || '')}`;
      }

      if (endpoint && event.id) {
        await apiDelete(endpoint);
        toast.success('Événement supprimé avec succès');
        onDelete?.();
        onClose();
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Erreur lors de la suppression de l\'événement');
    } finally {
      setIsDeleting(false);
    }
  }, [isMatchAmical, isEntrainement, isPlateau, event.id, onDelete, onClose]);

  const getTitle = () => {
    if (isMatchAmical) return 'Modifier le match amical';
    if (isEntrainement) return 'Modifier l\'entraînement';
    if (isPlateau) return 'Modifier le plateau';
    return 'Modifier l\'événement';
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-[90vw] md:w-[85vw] lg:w-[80vw]">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">
          {isMatchAmical ? (
            <>
              {/* Champs de base du match amical */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    value={matchData.date}
                    onChange={(e) => setMatchData({ ...matchData, date: e.target.value })}
                    placeholder="DD/MM/YYYY"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Heure *</Label>
                  <Input
                    id="time"
                    value={matchData.time}
                    onChange={(e) => setMatchData({ ...matchData, time: e.target.value })}
                    placeholder="HH:MM"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="localTeam">Équipe locale *</Label>
                  <Input
                    id="localTeam"
                    value={matchData.localTeam}
                    onChange={(e) => setMatchData({ ...matchData, localTeam: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="awayTeam">Équipe adverse *</Label>
                  <Input
                    id="awayTeam"
                    value={matchData.awayTeam}
                    onChange={(e) => setMatchData({ ...matchData, awayTeam: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="competition">Compétition *</Label>
                  <Input
                    id="competition"
                    value={matchData.competition}
                    onChange={(e) => setMatchData({ ...matchData, competition: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="venue">Lieu</Label>
                  <select
                    id="venue"
                    value={matchData.venue}
                    onChange={(e) => setMatchData({ ...matchData, venue: e.target.value as 'domicile' | 'extérieur' })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <option value="domicile">Domicile</option>
                    <option value="extérieur">Extérieur</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="horaireRendezVous">Horaire rendez-vous</Label>
                  <Input
                    id="horaireRendezVous"
                    value={matchData.horaireRendezVous}
                    onChange={(e) => setMatchData({ ...matchData, horaireRendezVous: e.target.value })}
                    placeholder="HH:MM"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stade-select">Sélectionner un stade</Label>
                  <StadeCombobox
                    stades={stades}
                    value={selectedStade?.nom}
                    onValueChange={setSelectedStade}
                    placeholder="Sélectionner un stade..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stadium">Stade</Label>
                  <Input
                    id="stadium"
                    value={matchData.stadium}
                    onChange={(e) => setMatchData({ ...matchData, stadium: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={matchData.address}
                    onChange={(e) => setMatchData({ ...matchData, address: e.target.value })}
                  />
                </div>
              </div>

              {/* Extras : Arbitres AFP, Encadrants, Accompagnateurs */}
              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Match complété et bien rempli</Label>
                  <Switch
                    checked={matchExtras.confirmed || false}
                    onCheckedChange={(checked) =>
                      setMatchExtras({ ...matchExtras, confirmed: checked })
                    }
                  />
                </div>

                <ContactListEditor
                  label="Arbitres AFP"
                  contacts={matchExtras.arbitreTouche || []}
                  officiels={officiels}
                  onContactsChange={(contacts) =>
                    setMatchExtras({ ...matchExtras, arbitreTouche: contacts })
                  }
                  onAddOfficiel={handleAddOfficiel}
                />

                <ContactListEditor
                  label="Contact encadrants"
                  contacts={matchExtras.contactEncadrants || []}
                  officiels={officiels}
                  onContactsChange={(contacts) =>
                    setMatchExtras({ ...matchExtras, contactEncadrants: contacts })
                  }
                  onAddOfficiel={handleAddOfficiel}
                />

                <ContactListEditor
                  label="Contact accompagnateur"
                  contacts={matchExtras.contactAccompagnateur || []}
                  officiels={officiels}
                  onContactsChange={(contacts) =>
                    setMatchExtras({ ...matchExtras, contactAccompagnateur: contacts })
                  }
                  onAddOfficiel={handleAddOfficiel}
                />
              </div>
            </>
          ) : (
            <>
              {/* Formulaire pour entraînement/plateau */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    value={simpleEventData.date}
                    onChange={(e) => setSimpleEventData({ ...simpleEventData, date: e.target.value })}
                    placeholder="DD/MM/YYYY"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Heure *</Label>
                  <Input
                    id="time"
                    value={simpleEventData.time}
                    onChange={(e) => setSimpleEventData({ ...simpleEventData, time: e.target.value })}
                    placeholder="HH:MM"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stade-select">Sélectionner un stade</Label>
                <StadeCombobox
                  stades={stades}
                  value={selectedStadeEntrainement?.nom}
                  onValueChange={setSelectedStadeEntrainement}
                  placeholder="Sélectionner un stade..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lieu">Lieu *</Label>
                <Input
                  id="lieu"
                  value={simpleEventData.lieu}
                  onChange={(e) => setSimpleEventData({ ...simpleEventData, lieu: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="encadrantNom">Nom de l'encadrant *</Label>
                  <Input
                    id="encadrantNom"
                    value={simpleEventData.encadrantNom}
                    onChange={(e) => setSimpleEventData({ ...simpleEventData, encadrantNom: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="encadrantPrenom">Prénom de l'encadrant *</Label>
                  <Input
                    id="encadrantPrenom"
                    value={simpleEventData.encadrantPrenom}
                    onChange={(e) => setSimpleEventData({ ...simpleEventData, encadrantPrenom: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          {onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full sm:w-auto order-3 sm:order-1"
            >
              {isDeleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          )}
          <div className="flex gap-2 order-2 w-full sm:w-auto justify-end">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Annuler
            </Button>
            <Button onClick={handleSave} className="w-full sm:w-auto">
              Enregistrer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
