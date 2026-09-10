"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Label } from "./label";
import { Match, Entrainement, Plateau } from "@/types/match";
import { generatePdf } from "@/lib/utils/pdf-export";
import { fetchPlanningExportData } from "@/lib/utils/planning-export-data";
import { useAppSettings } from "@/hooks/useAppSettings";
import { mergeClubWithSettings, roleLabelWithClub } from "@/lib/settings";
import {
  EXPORT_MODAL_BODY_CLASS,
  EXPORT_MODAL_CONTENT_CLASS,
  EXPORT_MODAL_FIELDS_CLASS,
  EXPORT_MODAL_GRID_CLASS,
  EXPORT_MODAL_OPTION_CLASS,
} from "./export-modal-layout";

interface ExportPdfModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MatchType = "officiel" | "amical" | "entrainement" | "plateau";

interface FieldConfig {
  label: string;
  key: string;
  enabled: boolean;
}

const defaultFields: FieldConfig[] = [
  { label: "Date", key: "date", enabled: true },
  { label: "Heure", key: "time", enabled: true },
  { label: "Type", key: "type", enabled: true },
  { label: "Équipe locale", key: "localTeam", enabled: true },
  { label: "Équipe visiteuse", key: "awayTeam", enabled: true },
  { label: "Lieu", key: "venue", enabled: true },
  { label: "Compétition", key: "competition", enabled: true },
  { label: "Horaire de rendez-vous", key: "horaireRendezVous", enabled: true },
  { label: "Stade", key: "stadium", enabled: true },
  { label: "Adresse", key: "address", enabled: true },
  { label: "Type de terrain", key: "terrainType", enabled: true },
  { label: "Arbitre", key: "referee", enabled: true },
  { label: "Assistant 1", key: "assistant1", enabled: true },
  { label: "Assistant 2", key: "assistant2", enabled: true },
  { label: "Arbitre", key: "arbitreTouche", enabled: true },
  { label: "Encadrants", key: "encadrants", enabled: true },
  { label: "Contact encadrants", key: "contactEncadrants", enabled: true },
  { label: "Accompagnateur", key: "contactAccompagnateur", enabled: true },
  { label: "Statut confirmé", key: "confirmed", enabled: true },
];

/** Colonnes dont le libellé doit être suffixé de l'abréviation du club. */
const ROLE_LABEL_BASES: Record<string, string> = {
  arbitreTouche: "Arbitre",
  encadrants: "Encadrants",
  contactAccompagnateur: "Accompagnateur",
};

export function ExportPdfModal({ open, onOpenChange }: ExportPdfModalProps) {
  const { settings } = useAppSettings();
  const withClubLabels = (fields: FieldConfig[]): FieldConfig[] =>
    fields.map((field) => {
      const base = ROLE_LABEL_BASES[field.key];
      return base ? { ...field, label: roleLabelWithClub(base, settings.clubAbbreviation) } : field;
    });
  const [selectedTypes, setSelectedTypes] = useState<Record<MatchType, boolean>>({
    officiel: true,
    amical: true,
    entrainement: true,
    plateau: true,
  });

  const [selectedFields, setSelectedFields] = useState<FieldConfig[]>(defaultFields);
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const handleTypeToggle = (type: MatchType) => {
    setSelectedTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const handleFieldToggle = (key: string) => {
    setSelectedFields((prev) => prev.map((field) => (field.key === key ? { ...field, enabled: !field.enabled } : field)));
  };

  const handleSelectAllFields = () => {
    setSelectedFields((prev) => prev.map((field) => ({ ...field, enabled: true })));
  };

  const handleDeselectAllFields = () => {
    setSelectedFields((prev) => prev.map((field) => ({ ...field, enabled: false })));
  };

  const handleExport = async () => {
    // Issue #214 : même source que le CSV/HTML — le planning publié par défaut, le
    // brouillon de travail seulement si explicitement demandé ; un événement annulé est
    // déjà exclu côté serveur, jamais affiché comme actif.
    const { club, events, extras } = await fetchPlanningExportData(includeDrafts);

    // Trier par date puis par heure
    const sortedEvents = [...events].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const timeA = "time" in a ? a.time : "";
      const timeB = "time" in b ? b.time : "";
      return timeA.localeCompare(timeB);
    });

    // Filtrer les événements selon les types sélectionnés
    const filteredEvents = sortedEvents.filter((event) => {
      let eventType: MatchType;
      if ("type" in event && event.type) {
        eventType = event.type;
      } else if ("localTeam" in event || "competition" in event) {
        const match = event as Match;
        eventType = match.type === "amical" ? "amical" : "officiel";
      } else if ("lieu" in event) {
        const simpleEvent = event as Entrainement | Plateau;
        eventType = simpleEvent.type;
      } else {
        return false;
      }
      return selectedTypes[eventType];
    });

    // Générer le PDF avec les données fraîchement chargées
    const exportClub = mergeClubWithSettings(club, settings);
    await generatePdf(filteredEvents, withClubLabels(selectedFields), extras || {}, exportClub, settings.clubAbbreviation);

    // Fermer le modal
    onOpenChange(false);
  };

  const hasSelectedTypes = Object.values(selectedTypes).some((v) => v);
  const hasSelectedFields = selectedFields.some((f) => f.enabled);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={EXPORT_MODAL_CONTENT_CLASS}>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>Export PDF</DialogTitle>
          <DialogDescription>Sélectionnez les types de matches et les champs à exporter</DialogDescription>
        </DialogHeader>

        <div className={EXPORT_MODAL_BODY_CLASS}>
          {/* Sélection des types */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Types de matches</Label>
            <div className={EXPORT_MODAL_GRID_CLASS}>
              {(["officiel", "amical", "entrainement", "plateau"] as MatchType[]).map((type) => (
                <div key={type} className={EXPORT_MODAL_OPTION_CLASS}>
                  <Checkbox id={`type-${type}`} checked={selectedTypes[type]} onCheckedChange={() => handleTypeToggle(type)} />
                  <Label htmlFor={`type-${type}`} className="text-sm font-normal cursor-pointer capitalize">
                    {type === "officiel"
                      ? "Matchs officiels"
                      : type === "amical"
                        ? "Matchs amicaux"
                        : type === "entrainement"
                          ? "Entraînements"
                          : "Plateaux"}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Statut de publication */}
          <div className={EXPORT_MODAL_OPTION_CLASS}>
            <Checkbox id="pdf-include-drafts" checked={includeDrafts} onCheckedChange={() => setIncludeDrafts((prev) => !prev)} />
            <Label htmlFor="pdf-include-drafts" className="text-sm font-normal cursor-pointer">
              Inclure les modifications non publiées (brouillon de travail)
            </Label>
          </div>

          {/* Sélection des champs */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-base font-semibold">Champs à exporter</Label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleSelectAllFields}>
                  Tout sélectionner
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleDeselectAllFields}>
                  Tout désélectionner
                </Button>
              </div>
            </div>
            <div className={EXPORT_MODAL_FIELDS_CLASS}>
              {withClubLabels(selectedFields).map((field) => (
                <div key={field.key} className={EXPORT_MODAL_OPTION_CLASS}>
                  <Checkbox id={`field-${field.key}`} checked={field.enabled} onCheckedChange={() => handleFieldToggle(field.key)} />
                  <Label htmlFor={`field-${field.key}`} className="text-sm font-normal cursor-pointer">
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleExport} disabled={!hasSelectedTypes || !hasSelectedFields}>
            Exporter PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
