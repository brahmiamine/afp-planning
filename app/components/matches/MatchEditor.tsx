'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { Match } from '@/types/match';
import { useMatchExtras, MatchExtras } from '@/hooks/useMatchExtras';
import { useOfficiels } from '@/hooks/useOfficiels';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ContactListEditor } from '@/components/ui/contact-list-editor';
import { apiPut } from '@/lib/utils/api';

interface MatchEditorProps {
  match: Match;
  onClose: () => void;
  onSave: () => void;
}

export const MatchEditor = memo(function MatchEditor({ match, onClose, onSave }: MatchEditorProps) {
  const { extras, save: saveExtras, isLoading } = useMatchExtras(match.id);
  const { officiels, reload: reloadOfficiels } = useOfficiels();
  const [formData, setFormData] = useState<MatchExtras>({
    id: match.id || '',
    confirmed: false,
    arbitreTouche: [],
    contactEncadrants: [],
    contactAccompagnateur: [],
  });

  useEffect(() => {
    if (extras) {
      setFormData({
        id: match.id || '',
        confirmed: extras.confirmed || false,
        arbitreTouche: Array.isArray(extras.arbitreTouche) ? extras.arbitreTouche : extras.arbitreTouche ? [extras.arbitreTouche] : [],
        contactEncadrants: Array.isArray(extras.contactEncadrants) ? extras.contactEncadrants : extras.contactEncadrants ? [extras.contactEncadrants] : [],
        contactAccompagnateur: Array.isArray(extras.contactAccompagnateur) ? extras.contactAccompagnateur : extras.contactAccompagnateur ? [extras.contactAccompagnateur] : [],
      });
    }
  }, [extras, match.id]);

  const handleAddOfficiel = useCallback(async (nom: string, telephone: string) => {
    await apiPut('/api/officiels', { nom, telephone });
    reloadOfficiels();
  }, [reloadOfficiels]);

  const handleSave = useCallback(async () => {
    if (!match.id) {
      alert('Erreur: L\'ID du match est manquant');
      return;
    }

    // Mettre à jour le fichier officiels.json si un numéro a été ajouté
    const updatePromises: Promise<void>[] = [];

    // Vérifier tous les arbitres AFP
    formData.arbitreTouche?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const officiel = officiels.find((o) => o.nom === contact.nom);
        if (!officiel?.telephone || officiel.telephone !== contact.numero) {
          updatePromises.push(
            fetch('/api/officiels', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nom: contact.nom,
                telephone: contact.numero,
              }),
            }).then(() => {})
          );
        }
      }
    });

    // Vérifier tous les encadrants
    formData.contactEncadrants?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const officiel = officiels.find((o) => o.nom === contact.nom);
        if (!officiel?.telephone || officiel.telephone !== contact.numero) {
          updatePromises.push(
            fetch('/api/officiels', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nom: contact.nom,
                telephone: contact.numero,
              }),
            }).then(() => {})
          );
        }
      }
    });

    // Vérifier tous les accompagnateurs
    formData.contactAccompagnateur?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const officiel = officiels.find((o) => o.nom === contact.nom);
        if (!officiel?.telephone || officiel.telephone !== contact.numero) {
          updatePromises.push(
            fetch('/api/officiels', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nom: contact.nom,
                telephone: contact.numero,
              }),
            }).then(() => {})
          );
        }
      }
    });

    // Attendre que toutes les mises à jour soient terminées
    await Promise.all(updatePromises);

    // Recharger la liste des officiels si des mises à jour ont été effectuées
    if (updatePromises.length > 0) {
      reloadOfficiels();
    }

    const success = await saveExtras(formData);
    if (success) {
      onSave();
      onClose();
    }
  }, [formData, match.id, saveExtras, onSave, onClose, officiels, reloadOfficiels]);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le match</DialogTitle>
        </DialogHeader>

        {/* Informations du match */}
        <div className="mb-6 p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">
            <span className="font-semibold">Match:</span> {match.localTeam} vs {match.awayTeam}
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">Date:</span> {match.date} à {match.time}
          </p>
        </div>

        {/* Formulaire */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="confirmed">Match confirmé et bien rempli</Label>
              <p className="text-sm text-muted-foreground">
                Marquer ce match comme confirmé lorsque toutes les informations sont complètes
              </p>
            </div>
            <Switch
              id="confirmed"
              checked={formData.confirmed || false}
              onCheckedChange={(checked) => setFormData({ ...formData, confirmed: checked })}
            />
          </div>

          <ContactListEditor
            contacts={formData.arbitreTouche || []}
            officiels={officiels}
            onContactsChange={(contacts) => setFormData({ ...formData, arbitreTouche: contacts })}
            onAddOfficiel={handleAddOfficiel}
            placeholder="Sélectionner un arbitre AFP"
            label="Arbitres AFP"
          />

          <ContactListEditor
            contacts={formData.contactEncadrants || []}
            officiels={officiels}
            onContactsChange={(contacts) => setFormData({ ...formData, contactEncadrants: contacts })}
            onAddOfficiel={handleAddOfficiel}
            placeholder="Sélectionner un encadrant"
            label="Encadrants"
          />

          <ContactListEditor
            contacts={formData.contactAccompagnateur || []}
            officiels={officiels}
            onContactsChange={(contacts) => setFormData({ ...formData, contactAccompagnateur: contacts })}
            onAddOfficiel={handleAddOfficiel}
            placeholder="Sélectionner un accompagnateur"
            label="Accompagnateurs"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
