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
import { generateIcal } from '@/lib/utils/ical-export';
import { useOfficiels } from '@/hooks/useOfficiels';
import { useEncadrants } from '@/hooks/useEncadrants';
import { useAccompagnateurs } from '@/hooks/useAccompagnateurs';

type Event = Match | Entrainement | Plateau;

interface ExportIcalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MatchType = 'officiel' | 'amical' | 'entrainement' | 'plateau';

export function ExportIcalModal({ open, onOpenChange }: ExportIcalModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<Record<MatchType, boolean>>({
    officiel: true,
    amical: true,
    entrainement: true,
    plateau: true,
  });
  const [personFilter, setPersonFilter] = useState('');

  const { officiels } = useOfficiels();
  const { encadrants } = useEncadrants();
  const { accompagnateurs } = useAccompagnateurs();

  const allPersons = useMemo(() => {
    const names = new Set<string>();
    officiels.forEach((o) => names.add(o.nom));
    encadrants.forEach((e) => names.add(e.nom));
    accompagnateurs.forEach((a) => names.add(a.nom));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [officiels, encadrants, accompagnateurs]);

  const handleTypeToggle = (type: MatchType) => {
    setSelectedTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const handleExport = async () => {
    const [freshMatchesData, freshMatchesAmicauxData, freshEntrainementsData, freshPlateauxData, freshAllExtras] =
      await Promise.all([
        apiGet<MatchesData>(`/api/matches?t=${Date.now()}`),
        apiGet<MatchesAmicauxData>(`/api/matches-amicaux?t=${Date.now()}`),
        apiGet<EntrainementsData>(`/api/entrainements?t=${Date.now()}`),
        apiGet<PlateauxData>(`/api/plateaux?t=${Date.now()}`),
        apiGet<Record<string, MatchExtras>>(`/api/matches-extras?t=${Date.now()}`),
      ]);

    const events: Event[] = [];

    if (freshMatchesData?.matches) {
      Object.values(freshMatchesData.matches).forEach((matches) => {
        matches.forEach((match) => events.push({ ...match, type: 'officiel' as const }));
      });
    }
    if (freshMatchesAmicauxData?.matches) {
      Object.values(freshMatchesAmicauxData.matches).forEach((matches) => {
        matches.forEach((match) => events.push({ ...match, type: 'amical' as const }));
      });
    }
    if (freshEntrainementsData?.entrainements) {
      Object.values(freshEntrainementsData.entrainements).forEach((items) => {
        items.forEach((item) => events.push(item));
      });
    }
    if (freshPlateauxData?.plateaux) {
      Object.values(freshPlateauxData.plateaux).forEach((items) => {
        items.forEach((item) => events.push(item));
      });
    }

    const filteredEvents = events.filter((event) => {
      let eventType: MatchType;
      if ('type' in event && event.type) {
        eventType = event.type;
      } else if ('localTeam' in event || 'competition' in event) {
        eventType = (event as Match).type === 'amical' ? 'amical' : 'officiel';
      } else {
        eventType = (event as Entrainement | Plateau).type;
      }
      return selectedTypes[eventType];
    });

    const icsContent = generateIcal(
      filteredEvents,
      freshAllExtras || {},
      freshMatchesData?.club,
      personFilter ? { personNom: personFilter, role: 'all' } : undefined,
    );

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `export-planning-${new Date().toISOString().split('T')[0]}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onOpenChange(false);
  };

  const hasSelectedTypes = Object.values(selectedTypes).some((v) => v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export iCal</DialogTitle>
          <DialogDescription>
            Générez un fichier .ics à importer dans votre calendrier (Google, Outlook, Apple...)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Types d&apos;événements</Label>
            <div className="grid grid-cols-2 gap-3">
              {(['officiel', 'amical', 'entrainement', 'plateau'] as MatchType[]).map((type) => (
                <div key={type} className="flex items-center space-x-2">
                  <Checkbox
                    id={`ical-type-${type}`}
                    checked={selectedTypes[type]}
                    onCheckedChange={() => handleTypeToggle(type)}
                  />
                  <Label htmlFor={`ical-type-${type}`} className="text-sm font-normal cursor-pointer">
                    {type === 'officiel'
                      ? 'Matchs officiels'
                      : type === 'amical'
                        ? 'Matchs amicaux'
                        : type === 'entrainement'
                          ? 'Entraînements'
                          : 'Plateaux'}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ical-person">Filtrer sur une personne (optionnel)</Label>
            <select
              id="ical-person"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
            >
              <option value="">Tout le monde</option>
              {allPersons.map((nom) => (
                <option key={nom} value={nom}>
                  {nom}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleExport} disabled={!hasSelectedTypes}>
            Exporter iCal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
