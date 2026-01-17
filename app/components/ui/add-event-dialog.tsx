'use client';

import { useState, memo, useEffect, useCallback } from 'react';
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
import { useOfficiels } from '@/hooks/useOfficiels';
import { useStades, Stade } from '@/hooks/useStades';
import { ContactOfficiel } from '@/hooks/useMatchExtras';
import { apiPost, apiPut } from '@/lib/utils/api';
import { toast } from 'sonner';

export type EventType = 'amical' | 'entrainement' | 'plateau';

interface AddEventDialogProps {
  open: boolean;
  onClose: () => void;
  eventType: EventType;
  onSuccess: () => void;
}

export const AddEventDialog = memo(function AddEventDialog({
  open,
  onClose,
  eventType,
  onSuccess,
}: AddEventDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { officiels, reload: reloadOfficiels } = useOfficiels();
  const { stades } = useStades();
  
  // Champs communs
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  
  // Champs pour match amical
  const [localTeam, setLocalTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [venue, setVenue] = useState<'domicile' | 'extérieur'>('domicile');
  // Competition est automatiquement "match amical" pour les matchs amicaux
  const competition = eventType === 'amical' ? 'Match amical' : '';
  const [horaireRendezVous, setHoraireRendezVous] = useState('');
  const [selectedStade, setSelectedStade] = useState<Stade | null>(null);
  const [stadium, setStadium] = useState('');
  const [address, setAddress] = useState('');
  
  // Extras pour match amical (arbitres, encadrants, accompagnateurs)
  const [confirmed, setConfirmed] = useState(false);
  const [arbitreTouche, setArbitreTouche] = useState<ContactOfficiel[]>([]);
  const [contactEncadrants, setContactEncadrants] = useState<ContactOfficiel[]>([]);
  const [contactAccompagnateur, setContactAccompagnateur] = useState<ContactOfficiel[]>([]);
  
  // Champs pour entraînement/plateau
  const [selectedStadeEntrainement, setSelectedStadeEntrainement] = useState<Stade | null>(null);
  const [lieu, setLieu] = useState('');
  const [encadrantNom, setEncadrantNom] = useState('');
  const [encadrantPrenom, setEncadrantPrenom] = useState('');

  // Quand un stade est sélectionné pour match amical, remplir les champs
  useEffect(() => {
    if (selectedStade) {
      setStadium(selectedStade.nom);
      setAddress(selectedStade.adresse || '');
    }
  }, [selectedStade]);

  // Quand un stade est sélectionné pour entraînement, remplir le champ lieu
  useEffect(() => {
    if (selectedStadeEntrainement) {
      const lieuText = selectedStadeEntrainement.adresse 
        ? `${selectedStadeEntrainement.nom} - ${selectedStadeEntrainement.adresse}`
        : selectedStadeEntrainement.nom;
      setLieu(lieuText);
    }
  }, [selectedStadeEntrainement]);

  // Initialiser la date avec aujourd'hui au format DD/MM/YYYY
  useEffect(() => {
    if (open && !date) {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      setDate(`${day}/${month}/${year}`);
    }
  }, [open, date]);

  const resetForm = () => {
    setDate('');
    setTime('');
    setLocalTeam('');
    setAwayTeam('');
    setVenue('domicile');
    setHoraireRendezVous('');
    setSelectedStade(null);
    setStadium('');
    setAddress('');
    setSelectedStadeEntrainement(null);
    setLieu('');
    setEncadrantNom('');
    setEncadrantPrenom('');
    setConfirmed(false);
    setArbitreTouche([]);
    setContactEncadrants([]);
    setContactAccompagnateur([]);
  };

  const handleAddOfficiel = useCallback(async (nom: string, telephone: string) => {
    await apiPut('/api/officiels', { nom, telephone });
    reloadOfficiels();
  }, [reloadOfficiels]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    
    try {
      let endpoint = '';
      let payload: any = { date, time };

      if (eventType === 'amical') {
        // Validation match amical
        if (!localTeam || !awayTeam) {
          toast.error('Veuillez remplir tous les champs obligatoires');
          setIsLoading(false);
          return;
        }

        endpoint = '/api/matches-amicaux';
        payload = {
          ...payload,
          type: 'amical',
          localTeam,
          awayTeam,
          venue,
          competition,
          horaireRendezVous: horaireRendezVous || time,
          details: stadium || address ? {
            stadium: stadium || '',
            address: address || '',
            dateTime: `${date} - ${time}`,
            competition,
            terrainType: '',
            itineraryLink: '',
            rawText: '',
          } : null,
        };

        // Créer le match d'abord
        const matchResponse = await apiPost<{ success: boolean; match: { id: string } }>(endpoint, payload);
        
        if (matchResponse.success && matchResponse.match?.id) {
          const matchId = matchResponse.match.id;

          // Mettre à jour les numéros dans officiels.json si nécessaire
          const updatePromises: Promise<void>[] = [];

          // Vérifier tous les arbitres AFP
          arbitreTouche.forEach((contact) => {
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
          contactEncadrants.forEach((contact) => {
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
          contactAccompagnateur.forEach((contact) => {
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

          // Sauvegarder les extras (arbitres, encadrants, accompagnateurs, confirmed)
          if (arbitreTouche.length > 0 || contactEncadrants.length > 0 || contactAccompagnateur.length > 0 || confirmed) {
            await apiPut(`/api/matches/${matchId}`, {
              id: matchId,
              confirmed,
              arbitreTouche: arbitreTouche.length > 0 ? arbitreTouche : undefined,
              contactEncadrants: contactEncadrants.length > 0 ? contactEncadrants : undefined,
              contactAccompagnateur: contactAccompagnateur.length > 0 ? contactAccompagnateur : undefined,
            });
          }
        }
      } else if (eventType === 'entrainement') {
        // Validation entraînement
        if (!lieu || !encadrantNom || !encadrantPrenom) {
          toast.error('Veuillez remplir tous les champs obligatoires');
          setIsLoading(false);
          return;
        }

        endpoint = '/api/entrainements';
        payload = {
          ...payload,
          lieu,
          encadrant: {
            nom: encadrantNom,
            prenom: encadrantPrenom,
          },
        };

        await apiPost(endpoint, payload);
      } else if (eventType === 'plateau') {
        // Validation plateau
        if (!lieu || !encadrantNom || !encadrantPrenom) {
          toast.error('Veuillez remplir tous les champs obligatoires');
          setIsLoading(false);
          return;
        }

        endpoint = '/api/plateaux';
        payload = {
          ...payload,
          lieu,
          encadrant: {
            nom: encadrantNom,
            prenom: encadrantPrenom,
          },
        };

        await apiPost(endpoint, payload);
      }
      
      toast.success(
        eventType === 'amical' 
          ? 'Match amical ajouté avec succès'
          : eventType === 'entrainement'
          ? 'Entraînement ajouté avec succès'
          : 'Plateau ajouté avec succès'
      );
      
      resetForm();
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Error adding event:', error);
      toast.error('Erreur lors de l\'ajout de l\'événement');
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (eventType) {
      case 'amical':
        return 'Ajouter un match amical';
      case 'entrainement':
        return 'Ajouter un entraînement';
      case 'plateau':
        return 'Ajouter un plateau';
      default:
        return 'Ajouter un événement';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-[90vw] md:w-[85vw] lg:w-[80vw]">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Champs communs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="text"
                placeholder="DD/MM/YYYY"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Heure *</Label>
              <Input
                id="time"
                type="text"
                placeholder="HH:MM"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Champs spécifiques au match amical */}
          {eventType === 'amical' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="localTeam">Équipe locale *</Label>
                  <Input
                    id="localTeam"
                    value={localTeam}
                    onChange={(e) => setLocalTeam(e.target.value)}
                    placeholder="Ex: Afp 18 U13 F 1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="awayTeam">Équipe adverse *</Label>
                  <Input
                    id="awayTeam"
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    placeholder="Ex: Équipe adverse"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="venue">Lieu</Label>
                <select
                  id="venue"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value as 'domicile' | 'extérieur')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <option value="domicile">Domicile</option>
                  <option value="extérieur">Extérieur</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="horaireRendezVous">Horaire rendez-vous</Label>
                  <Input
                    id="horaireRendezVous"
                    value={horaireRendezVous}
                    onChange={(e) => setHoraireRendezVous(e.target.value)}
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
                    value={stadium}
                    onChange={(e) => setStadium(e.target.value)}
                    placeholder="Ex: Stade Poissonniers"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ex: RUE JEAN COCTEAU - 75018 - PARIS"
                  />
                </div>
              </div>

              {/* Extras : Arbitres AFP, Encadrants, Accompagnateurs */}
              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <Label htmlFor="confirmed" className="text-sm sm:text-base">Match complété et bien rempli</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Marquer ce match comme complété lorsque toutes les informations sont complètes
                    </p>
                  </div>
                  <Switch
                    id="confirmed"
                    checked={confirmed}
                    onCheckedChange={setConfirmed}
                    className="flex-shrink-0"
                  />
                </div>

                <ContactListEditor
                  label="Arbitres AFP"
                  contacts={arbitreTouche}
                  officiels={officiels}
                  onContactsChange={setArbitreTouche}
                  onAddOfficiel={handleAddOfficiel}
                  placeholder="Sélectionner un arbitre AFP"
                />

                <ContactListEditor
                  label="Contact encadrants"
                  contacts={contactEncadrants}
                  officiels={officiels}
                  onContactsChange={setContactEncadrants}
                  onAddOfficiel={handleAddOfficiel}
                  placeholder="Sélectionner un encadrant"
                />

                <ContactListEditor
                  label="Contact accompagnateur"
                  contacts={contactAccompagnateur}
                  officiels={officiels}
                  onContactsChange={setContactAccompagnateur}
                  onAddOfficiel={handleAddOfficiel}
                  placeholder="Sélectionner un accompagnateur"
                />
              </div>
            </>
          )}

          {/* Champs pour entraînement/plateau */}
          {(eventType === 'entrainement' || eventType === 'plateau') && (
            <>
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
                  value={lieu}
                  onChange={(e) => setLieu(e.target.value)}
                  placeholder="Ex: Stade Poissonniers, Terrain 2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="encadrantNom">Nom de l'encadrant *</Label>
                  <Input
                    id="encadrantNom"
                    value={encadrantNom}
                    onChange={(e) => setEncadrantNom(e.target.value)}
                    placeholder="Ex: DUPONT"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="encadrantPrenom">Prénom de l'encadrant *</Label>
                  <Input
                    id="encadrantPrenom"
                    value={encadrantPrenom}
                    onChange={(e) => setEncadrantPrenom(e.target.value)}
                    placeholder="Ex: Jean"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Ajout...' : 'Ajouter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
