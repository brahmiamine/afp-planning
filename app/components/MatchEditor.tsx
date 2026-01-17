'use client';

import { useState, useEffect } from 'react';
import { Match } from '@/types/match';

interface MatchExtras {
  id: string;
  arbitreTouche?: string;
  contactEncadrants?: {
    nom: string;
    numero: string;
  };
  contactAccompagnateur?: {
    nom: string;
    numero: string;
  };
}

interface MatchEditorProps {
  match: Match;
  onClose: () => void;
  onSave: () => void;
}

export default function MatchEditor({ match, onClose, onSave }: MatchEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extras, setExtras] = useState<MatchExtras>({
    id: match.id || '',
    arbitreTouche: '',
    contactEncadrants: {
      nom: '',
      numero: '',
    },
    contactAccompagnateur: {
      nom: '',
      numero: '',
    },
  });

  // Charger les informations supplémentaires existantes
  useEffect(() => {
    const loadExtras = async () => {
      if (!match.id) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/matches/${match.id}`);
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setExtras({
              id: match.id,
              arbitreTouche: data.arbitreTouche || '',
              contactEncadrants: data.contactEncadrants || { nom: '', numero: '' },
              contactAccompagnateur: data.contactAccompagnateur || { nom: '', numero: '' },
            });
          }
        }
      } catch (error) {
        console.error('Erreur lors du chargement des extras:', error);
      } finally {
        setLoading(false);
      }
    };

    loadExtras();
  }, [match.id]);

  const handleSave = async () => {
    // Valider que l'ID du match existe
    if (!match.id || match.id.trim() === '') {
      console.error('Match ID is missing:', match);
      console.error('Match object:', JSON.stringify(match, null, 2));
      alert(`Erreur: L'ID du match est manquant. Impossible de sauvegarder.\n\nMatch ID: ${match.id}\nVérifiez que le match a bien un ID.`);
      return;
    }

    console.log('Saving match extras with ID:', match.id);

    try {
      setSaving(true);
      
      // S'assurer que l'ID dans extras correspond au match.id
      const extrasToSave = {
        ...extras,
        id: match.id, // Forcer l'ID du match
      };

      const response = await fetch(`/api/matches/${match.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(extrasToSave),
      });

      if (response.ok) {
        onSave();
        onClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Erreur lors de la sauvegarde: ${errorData.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">
              Modifier le match
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

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
            {/* Arbitre de touche */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Arbitre de touche
              </label>
              <input
                type="text"
                value={extras.arbitreTouche || ''}
                onChange={(e) =>
                  setExtras({ ...extras, arbitreTouche: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
                placeholder="Nom de l'arbitre de touche"
              />
            </div>

            {/* Contact encadrants */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact encadrants
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <input
                    type="text"
                    value={extras.contactEncadrants?.nom || ''}
                    onChange={(e) =>
                      setExtras({
                        ...extras,
                        contactEncadrants: {
                          ...extras.contactEncadrants,
                          nom: e.target.value,
                          numero: extras.contactEncadrants?.numero || '',
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
                    placeholder="Nom"
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    value={extras.contactEncadrants?.numero || ''}
                    onChange={(e) =>
                      setExtras({
                        ...extras,
                        contactEncadrants: {
                          ...extras.contactEncadrants,
                          nom: extras.contactEncadrants?.nom || '',
                          numero: e.target.value,
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
                    placeholder="Numéro de téléphone"
                  />
                </div>
              </div>
            </div>

            {/* Contact accompagnateur */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact accompagnateur
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <input
                    type="text"
                    value={extras.contactAccompagnateur?.nom || ''}
                    onChange={(e) =>
                      setExtras({
                        ...extras,
                        contactAccompagnateur: {
                          ...extras.contactAccompagnateur,
                          nom: e.target.value,
                          numero: extras.contactAccompagnateur?.numero || '',
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
                    placeholder="Nom"
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    value={extras.contactAccompagnateur?.numero || ''}
                    onChange={(e) =>
                      setExtras({
                        ...extras,
                        contactAccompagnateur: {
                          ...extras.contactAccompagnateur,
                          nom: extras.contactAccompagnateur?.nom || '',
                          numero: e.target.value,
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
                    placeholder="Numéro de téléphone"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Boutons */}
          <div className="flex justify-end gap-4 mt-8">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Sauvegarde...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
