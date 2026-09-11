"use client";

import { memo, useCallback } from "react";
import { Match } from "@/types/match";
import { useMatchAssignmentsEditor } from "@/hooks/useMatchAssignmentsEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ContactListEditor } from "@/components/ui/contact-list-editor";
import { MatchAuditLogPanel } from "@/components/events/MatchAuditLogPanel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canEdit } from "@/lib/auth/roles";
import { useAppSettings } from "@/hooks/useAppSettings";
import { roleLabelWithClub } from "@/lib/settings";

interface MatchEditorProps {
  match: Match;
  onClose: () => void;
  onSave: () => void;
}

export const MatchEditor = memo(function MatchEditor({ match, onClose, onSave }: MatchEditorProps) {
  const { user } = useCurrentUser();
  const editable = canEdit(user?.accessRole);
  const { settings } = useAppSettings();
  const clubAbbr = settings.clubAbbreviation;
  const {
    formData,
    setFormData,
    officiels,
    encadrants,
    accompagnateurs,
    handleSave: saveAssignments,
    isLoading,
  } = useMatchAssignmentsEditor(match);

  const handleSave = useCallback(async () => {
    const success = await saveAssignments();
    if (success) {
      onSave();
      onClose();
    }
  }, [saveAssignments, onSave, onClose]);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] sm:w-[90vw] md:w-[85vw] lg:w-[80vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Modifier le match</DialogTitle>
        </DialogHeader>

        {/* Informations du match */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-muted rounded-lg">
          <p className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2">
            <span className="font-semibold">Match:</span> {match.localTeam} vs {match.awayTeam}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            <span className="font-semibold">Date:</span> {match.date} à {match.time}
          </p>
        </div>

        {/* Formulaire */}
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <Label htmlFor="confirmed" className="text-sm sm:text-base">
                Match complété et bien rempli
              </Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Marquer ce match comme complété lorsque toutes les informations sont complètes
              </p>
            </div>
            <Switch
              id="confirmed"
              checked={formData.confirmed || false}
              onCheckedChange={(checked) => setFormData({ ...formData, confirmed: checked })}
              className="shrink-0"
            />
          </div>

          <ContactListEditor
            contacts={formData.arbitreTouche || []}
            officiels={officiels}
            assignmentType="officiel"
            onContactsChange={(contacts) => setFormData({ ...formData, arbitreTouche: contacts })}
            placeholder={`Sélectionner un arbitre ${clubAbbr}`.trim()}
            label={roleLabelWithClub("Arbitres", clubAbbr)}
          />

          <ContactListEditor
            contacts={formData.contactEncadrants || []}
            officiels={encadrants}
            assignmentType="encadrant"
            onContactsChange={(contacts) => setFormData({ ...formData, contactEncadrants: contacts })}
            placeholder={`Sélectionner un encadrant ${clubAbbr}`.trim()}
            label={roleLabelWithClub("Encadrants", clubAbbr)}
          />

          <ContactListEditor
            contacts={formData.contactAccompagnateur || []}
            officiels={accompagnateurs}
            assignmentType="accompagnateur"
            onContactsChange={(contacts) => setFormData({ ...formData, contactAccompagnateur: contacts })}
            placeholder={`Sélectionner un accompagnateur ${clubAbbr}`.trim()}
            label={roleLabelWithClub("Accompagnateurs", clubAbbr)}
          />

          {match.id && <MatchAuditLogPanel matchId={match.id} />}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Annuler
          </Button>
          {editable && (
            <Button onClick={handleSave} disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? "Sauvegarde..." : "Enregistrer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
