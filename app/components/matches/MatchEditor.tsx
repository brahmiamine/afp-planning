'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { Match } from '@/types/match';
import { useMatchExtras, MatchExtras } from '@/hooks/useMatchExtras';
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

interface MatchEditorProps {
  match: Match;
  onClose: () => void;
  onSave: () => void;
}

export const MatchEditor = memo(function MatchEditor({ match, onClose, onSave }: MatchEditorProps) {
  const { extras, save: saveExtras, isLoading } = useMatchExtras(match.id);
  const [formData, setFormData] = useState<MatchExtras>({
    id: match.id || '',
    confirmed: false,
    arbitreTouche: '',
    contactEncadrants: { nom: '', numero: '' },
    contactAccompagnateur: { nom: '', numero: '' },
  });

  useEffect(() => {
    if (extras) {
      setFormData({
        id: match.id || '',
        confirmed: extras.confirmed || false,
        arbitreTouche: extras.arbitreTouche || '',
        contactEncadrants: extras.contactEncadrants || { nom: '', numero: '' },
        contactAccompagnateur: extras.contactAccompagnateur || { nom: '', numero: '' },
      });
    }
  }, [extras, match.id]);

  const handleSave = useCallback(async () => {
    if (!match.id) {
      alert('Erreur: L\'ID du match est manquant');
      return;
    }

    const success = await saveExtras(formData);
    if (success) {
      onSave();
      onClose();
    }
  }, [formData, match.id, saveExtras, onSave, onClose]);

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

          <div className="space-y-2">
            <Label htmlFor="arbitreTouche">Arbitre de touche</Label>
            <Input
              id="arbitreTouche"
              value={formData.arbitreTouche || ''}
              onChange={(e) => setFormData({ ...formData, arbitreTouche: e.target.value })}
              placeholder="Nom de l'arbitre de touche"
            />
          </div>

          <div className="space-y-2">
            <Label>Contact encadrants</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="encadrants-nom" className="text-xs">Nom</Label>
                <Input
                  id="encadrants-nom"
                  value={formData.contactEncadrants?.nom || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contactEncadrants: {
                        ...formData.contactEncadrants,
                        nom: e.target.value,
                        numero: formData.contactEncadrants?.numero || '',
                      },
                    })
                  }
                  placeholder="Nom"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="encadrants-numero" className="text-xs">Numéro de téléphone</Label>
                <Input
                  id="encadrants-numero"
                  type="tel"
                  value={formData.contactEncadrants?.numero || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contactEncadrants: {
                        ...formData.contactEncadrants,
                        nom: formData.contactEncadrants?.nom || '',
                        numero: e.target.value,
                      },
                    })
                  }
                  placeholder="Numéro de téléphone"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contact accompagnateur</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="accompagnateur-nom" className="text-xs">Nom</Label>
                <Input
                  id="accompagnateur-nom"
                  value={formData.contactAccompagnateur?.nom || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contactAccompagnateur: {
                        ...formData.contactAccompagnateur,
                        nom: e.target.value,
                        numero: formData.contactAccompagnateur?.numero || '',
                      },
                    })
                  }
                  placeholder="Nom"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accompagnateur-numero" className="text-xs">Numéro de téléphone</Label>
                <Input
                  id="accompagnateur-numero"
                  type="tel"
                  value={formData.contactAccompagnateur?.numero || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contactAccompagnateur: {
                        ...formData.contactAccompagnateur,
                        nom: formData.contactAccompagnateur?.nom || '',
                        numero: e.target.value,
                      },
                    })
                  }
                  placeholder="Numéro de téléphone"
                />
              </div>
            </div>
          </div>
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
