'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { Match } from '@/types/match';
import { useMatchExtras, MatchExtras } from '@/hooks/useMatchExtras';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';

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
    <Modal isOpen={true} onClose={onClose} title="Modifier le match" size="lg">
      {/* Informations du match */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600 mb-2">
          <span className="font-semibold">Match:</span> {match.localTeam} vs {match.awayTeam}
        </p>
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Date:</span> {match.date} à {match.time}
        </p>
      </div>

      {/* Formulaire */}
      <div className="space-y-6">
        <Switch
          checked={formData.confirmed || false}
          onChange={(checked) => setFormData({ ...formData, confirmed: checked })}
          label="Match confirmé et bien rempli"
          description="Marquer ce match comme confirmé lorsque toutes les informations sont complètes"
        />

        <Input
          label="Arbitre de touche"
          value={formData.arbitreTouche || ''}
          onChange={(e) => setFormData({ ...formData, arbitreTouche: e.target.value })}
          placeholder="Nom de l'arbitre de touche"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Contact encadrants</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
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
            <Input
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Contact accompagnateur</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
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
            <Input
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

      {/* Boutons */}
      <div className="flex justify-end gap-4 mt-8">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="primary" onClick={handleSave} isLoading={isLoading}>
          Enregistrer
        </Button>
      </div>
    </Modal>
  );
});
