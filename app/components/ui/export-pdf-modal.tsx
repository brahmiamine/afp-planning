'use client';

import { useState, useMemo } from 'react';
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
import { useMatches } from '@/hooks/useMatches';
import { useMatchesAmicaux } from '@/hooks/useMatchesAmicaux';
import { useEntrainements } from '@/hooks/useEntrainements';
import { usePlateaux } from '@/hooks/usePlateaux';
import { useAllMatchExtras } from '@/hooks/useAllMatchExtras';
import { Match, Entrainement, Plateau } from '@/types/match';
import { generatePdf } from '@/lib/utils/pdf-export';

type Event = Match | Entrainement | Plateau;

interface ExportPdfModalProps {
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

export function ExportPdfModal({ open, onOpenChange }: ExportPdfModalProps) {
  const { matchesData } = useMatches();
  const { matchesData: matchesAmicauxData } = useMatchesAmicaux();
  const { data: entrainementsData } = useEntrainements();
  const { data: plateauxData } = usePlateaux();
  const { allExtras } = useAllMatchExtras();

  const [selectedTypes, setSelectedTypes] = useState<Record<MatchType, boolean>>({
    officiel: true,
    amical: true,
    entrainement: true,
    plateau: true,
  });

  const [selectedFields, setSelectedFields] = useState<FieldConfig[]>(defaultFields);

  // Collecter tous les événements
  const allEvents = useMemo(() => {
    const events: Event[] = [];

    // Matchs officiels
    if (matchesData?.matches) {
      Object.values(matchesData.matches).forEach((matches) => {
        matches.forEach((match) => {
          events.push({ ...match, type: 'officiel' as const });
        });
      });
    }

    // Matchs amicaux
    if (matchesAmicauxData?.matches) {
      Object.values(matchesAmicauxData.matches).forEach((matches) => {
        matches.forEach((match) => {
          events.push({ ...match, type: 'amical' as const });
        });
      });
    }

    // Entraînements
    if (entrainementsData?.entrainements) {
      Object.values(entrainementsData.entrainements).forEach((entrainements) => {
        entrainements.forEach((entrainement) => {
          events.push(entrainement);
        });
      });
    }

    // Plateaux
    if (plateauxData?.plateaux) {
      Object.values(plateauxData.plateaux).forEach((plateaux) => {
        plateaux.forEach((plateau) => {
          events.push(plateau);
        });
      });
    }

    // Trier par date puis par heure
    return events.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const timeA = 'time' in a ? a.time : '';
      const timeB = 'time' in b ? b.time : '';
      return timeA.localeCompare(timeB);
    });
  }, [matchesData, matchesAmicauxData, entrainementsData, plateauxData]);

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
    // Filtrer les événements selon les types sélectionnés
    const filteredEvents = allEvents.filter((event) => {
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

    // Générer le PDF (maintenant async)
    await generatePdf(filteredEvents, selectedFields, allExtras, matchesData?.club);

    // Fermer le modal
    onOpenChange(false);
  };

  const hasSelectedTypes = Object.values(selectedTypes).some((v) => v);
  const hasSelectedFields = selectedFields.some((f) => f.enabled);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
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
                      id={`type-${type}`}
                      checked={selectedTypes[type]}
                      onCheckedChange={() => handleTypeToggle(type)}
                    />
                    <Label
                      htmlFor={`type-${type}`}
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
                    id={`field-${field.key}`}
                    checked={field.enabled}
                    onCheckedChange={() => handleFieldToggle(field.key)}
                  />
                  <Label
                    htmlFor={`field-${field.key}`}
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
            Exporter PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
