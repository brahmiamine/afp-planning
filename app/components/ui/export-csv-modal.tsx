'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Label } from './label';
import {
  Match,
  Entrainement,
  Plateau,
  MatchesData,
  MatchesAmicauxData,
  EntrainementsData,
  PlateauxData,
} from '@/types/match';
import { apiGet } from '@/lib/utils/api';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { generateCsv } from '@/lib/utils/csv-export';

type Event = Match | Entrainement | Plateau;

interface ExportCsvModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MatchType = 'officiel' | 'amical' | 'entrainement' | 'plateau';

interface FieldConfig {
  label: string;
  key: string;
  enabled: boolean;
}

const defaultFields: FieldConfig[] = [
  { label: 'Date', key: 'date', enabled: true },
  { label: 'Heure', key: 'time', enabled: true },
  { label: 'Type', key: 'type', enabled: true },
  { label: 'Équipe locale', key: 'localTeam', enabled: true },
  { label: 'Équipe visiteuse', key: 'awayTeam', enabled: true },
  { label: 'Lieu', key: 'venue', enabled: true },
  { label: 'Compétition', key: 'competition', enabled: true },
  { label: 'Horaire de rendez-vous', key: 'horaireRendezVous', enabled: true },
  { label: 'Stade', key: 'stadium', enabled: true },
  { label: 'Adresse', key: 'address', enabled: true },
  { label: 'Type de terrain', key: 'terrainType', enabled: true },
  { label: 'Arbitre', key: 'referee', enabled: true },
  { label: 'Assistant 1', key: 'assistant1', enabled: true },
  { label: 'Assistant 2', key: 'assistant2', enabled: true },
  { label: 'Arbitre AFP', key: 'arbitreTouche', enabled: true },
  { label: 'Encadrants', key: 'encadrants', enabled: true },
  { label: 'Contact encadrants', key: 'contactEncadrants', enabled: true },
  { label: 'Accompagnateur', key: 'contactAccompagnateur', enabled: true },
  { label: 'Statut confirmé', key: 'confirmed', enabled: true },
];

export function ExportCsvModal({ open, onOpenChange }: ExportCsvModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<Record<MatchType, boolean>>({
    officiel: true,
    amical: true,
    entrainement: true,
    plateau: true,
  });

  const [selectedFields, setSelectedFields] = useState<FieldConfig[]>(defaultFields);

  const handleTypeToggle = (type: MatchType) => {
    setSelectedTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const handleFieldToggle = (key: string) => {
    setSelectedFields((prev) =>
      prev.map((field) =>
        field.key === key ? { ...field, enabled: !field.enabled } : field
      )
    );
  };

  const handleSelectAllFields = () => {
    setSelectedFields((prev) => prev.map((field) => ({ ...field, enabled: true })));
  };

  const handleDeselectAllFields = () => {
    setSelectedFields((prev) => prev.map((field) => ({ ...field, enabled: false })));
  };

  const handleExport = async () => {
    // Charger directement toutes les données via les API pour s'assurer d'avoir les dernières modifications
    const [
      freshMatchesData,
      freshMatchesAmicauxData,
      freshEntrainementsData,
      freshPlateauxData,
      freshAllExtras,
    ] = await Promise.all([
      apiGet<MatchesData>(`/api/matches?t=${Date.now()}`),
      apiGet<MatchesAmicauxData>(`/api/matches-amicaux?t=${Date.now()}`),
      apiGet<EntrainementsData>(`/api/entrainements?t=${Date.now()}`),
      apiGet<PlateauxData>(`/api/plateaux?t=${Date.now()}`),
      apiGet<Record<string, MatchExtras>>(`/api/matches-extras?t=${Date.now()}`),
    ]);

    // Reconstruire les événements avec les données fraîchement chargées
    const events: Event[] = [];

    // Matchs officiels
    if (freshMatchesData?.matches) {
      Object.values(freshMatchesData.matches).forEach((matches) => {
        matches.forEach((match) => {
          events.push({ ...match, type: 'officiel' as const });
        });
      });
    }

    // Matchs amicaux
    if (freshMatchesAmicauxData?.matches) {
      Object.values(freshMatchesAmicauxData.matches).forEach((matches) => {
        matches.forEach((match) => {
          events.push({ ...match, type: 'amical' as const });
        });
      });
    }

    // Entraînements
    if (freshEntrainementsData?.entrainements) {
      Object.values(freshEntrainementsData.entrainements).forEach((entrainements) => {
        entrainements.forEach((entrainement) => {
          events.push(entrainement);
        });
      });
    }

    // Plateaux
    if (freshPlateauxData?.plateaux) {
      Object.values(freshPlateauxData.plateaux).forEach((plateaux) => {
        plateaux.forEach((plateau) => {
          events.push(plateau);
        });
      });
    }

    // Trier par date puis par heure
    const sortedEvents = events.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const timeA = 'time' in a ? a.time : '';
      const timeB = 'time' in b ? b.time : '';
      return timeA.localeCompare(timeB);
    });

    // Filtrer les événements selon les types sélectionnés
    const filteredEvents = sortedEvents.filter((event) => {
      let eventType: MatchType;
      if ('type' in event && event.type) {
        eventType = event.type;
      } else if ('localTeam' in event || 'competition' in event) {
        const match = event as Match;
        eventType = match.type === 'amical' ? 'amical' : 'officiel';
      } else if ('lieu' in event) {
        const simpleEvent = event as Entrainement | Plateau;
        eventType = simpleEvent.type;
      } else {
        return false;
      }
      return selectedTypes[eventType];
    });

    await generateCsv(
      filteredEvents,
      selectedFields,
      freshAllExtras || {},
      freshMatchesData?.club
    );

    onOpenChange(false);
  };

  const hasSelectedTypes = Object.values(selectedTypes).some((v) => v);
  const hasSelectedFields = selectedFields.some((f) => f.enabled);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export CSV</DialogTitle>
          <DialogDescription>
            Sélectionnez les types de matches et les champs à exporter
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Sélection des types */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Types de matches</Label>
            <div className="grid grid-cols-2 gap-3">
              {(['officiel', 'amical', 'entrainement', 'plateau'] as MatchType[]).map(
                (type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={`csv-type-${type}`}
                      checked={selectedTypes[type]}
                      onCheckedChange={() => handleTypeToggle(type)}
                    />
                    <Label
                      htmlFor={`csv-type-${type}`}
                      className="text-sm font-normal cursor-pointer capitalize"
                    >
                      {type === 'officiel'
                        ? 'Matchs officiels'
                        : type === 'amical'
                          ? 'Matchs amicaux'
                          : type === 'entrainement'
                            ? 'Entraînements'
                            : 'Plateaux'}
                    </Label>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Sélection des champs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Champs à exporter</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllFields}
                >
                  Tout sélectionner
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeselectAllFields}
                >
                  Tout désélectionner
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto border rounded-md p-3">
              {selectedFields.map((field) => (
                <div key={field.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`csv-field-${field.key}`}
                    checked={field.enabled}
                    onCheckedChange={() => handleFieldToggle(field.key)}
                  />
                  <Label
                    htmlFor={`csv-field-${field.key}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleExport}
            disabled={!hasSelectedTypes || !hasSelectedFields}
          >
            Exporter CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

