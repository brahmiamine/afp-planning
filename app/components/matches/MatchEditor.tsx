"use client";

import { useState, useEffect, memo, useCallback } from "react";
import { Match } from "@/types/match";
import { useMatchExtras, MatchExtras } from "@/hooks/useMatchExtras";
import { useOfficiels } from "@/hooks/useOfficiels";
import { useEncadrants } from "@/hooks/useEncadrants";
import { useAccompagnateurs } from "@/hooks/useAccompagnateurs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ContactListEditor } from "@/components/ui/contact-list-editor";
import { MatchAuditLogPanel } from "@/components/events/MatchAuditLogPanel";
import { apiPut } from "@/lib/utils/api";
import { getOfficielAvailabilityStatus } from "@/lib/utils/officiel-availability";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canEdit } from "@/lib/auth/roles";

interface MatchEditorProps {
  match: Match;
  onClose: () => void;
  onSave: () => void;
}

export const MatchEditor = memo(function MatchEditor({ match, onClose, onSave }: MatchEditorProps) {
  const { extras, save: saveExtras, isLoading } = useMatchExtras(match.id);
  const { user } = useCurrentUser();
  const editable = canEdit(user?.role);
  const { officiels, reload: reloadOfficiels } = useOfficiels();
  const { encadrants, reload: reloadEncadrants } = useEncadrants();
  const { accompagnateurs, reload: reloadAccompagnateurs } = useAccompagnateurs();
  const [formData, setFormData] = useState<MatchExtras>({
    id: match.id || "",
    confirmed: false,
    arbitreTouche: [],
    contactEncadrants: [],
    contactAccompagnateur: [],
  });

  useEffect(() => {
    if (extras) {
      setFormData({
        id: match.id || "",
        confirmed: extras.confirmed || false,
        arbitreTouche: Array.isArray(extras.arbitreTouche) ? extras.arbitreTouche : extras.arbitreTouche ? [extras.arbitreTouche] : [],
        contactEncadrants: Array.isArray(extras.contactEncadrants)
          ? extras.contactEncadrants
          : extras.contactEncadrants
            ? [extras.contactEncadrants]
            : [],
        contactAccompagnateur: Array.isArray(extras.contactAccompagnateur)
          ? extras.contactAccompagnateur
          : extras.contactAccompagnateur
            ? [extras.contactAccompagnateur]
            : [],
      });
    }
  }, [extras, match.id]);

  const handleAddOfficiel = useCallback(
    async (nom: string, telephone: string) => {
      await apiPut("/api/officiels", { nom, telephone });
      reloadOfficiels();
    },
    [reloadOfficiels],
  );

  const handleAddEncadrant = useCallback(
    async (nom: string, telephone: string) => {
      await apiPut("/api/encadrants", { nom, telephone });
      reloadEncadrants();
    },
    [reloadEncadrants],
  );

  const handleAddAccompagnateur = useCallback(
    async (nom: string, telephone: string) => {
      await apiPut("/api/accompagnateurs", { nom, telephone });
      reloadAccompagnateurs();
    },
    [reloadAccompagnateurs],
  );

  const handleSave = useCallback(async () => {
    const roleContacts = [
      { role: "officiel", contacts: formData.arbitreTouche || [], source: officiels },
      { role: "encadrant", contacts: formData.contactEncadrants || [], source: encadrants },
      { role: "accompagnateur", contacts: formData.contactAccompagnateur || [], source: accompagnateurs },
    ] as const;

    for (const roleEntry of roleContacts) {
      for (const selectedContact of roleEntry.contacts) {
        if (!selectedContact?.nom) {
          continue;
        }

        const person = roleEntry.source.find((item) => item.nom.toLowerCase() === selectedContact.nom.toLowerCase());
        if (!person) {
          continue;
        }

        const availability = getOfficielAvailabilityStatus(person, match.date, match.time);
        if (availability.unavailable) {
          toast.error(availability.message || `${person.nom} est indisponible pour ce match.`);
          return;
        }
      }
    }

    if (!match.id) {
      alert("Erreur: L'ID du match est manquant");
      return;
    }

    const updatePromises: Promise<void>[] = [];

    formData.arbitreTouche?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const officiel = officiels.find((item) => item.nom === contact.nom);
        if (!officiel?.telephone || officiel.telephone !== contact.numero) {
          updatePromises.push(
            fetch("/api/officiels", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nom: contact.nom, telephone: contact.numero }),
            }).then(() => {}),
          );
        }
      }
    });

    formData.contactEncadrants?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const encadrant = encadrants.find((item) => item.nom === contact.nom);
        if (!encadrant?.telephone || encadrant.telephone !== contact.numero) {
          updatePromises.push(
            fetch("/api/encadrants", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nom: contact.nom, telephone: contact.numero }),
            }).then(() => {}),
          );
        }
      }
    });

    formData.contactAccompagnateur?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const accompagnateur = accompagnateurs.find((item) => item.nom === contact.nom);
        if (!accompagnateur?.telephone || accompagnateur.telephone !== contact.numero) {
          updatePromises.push(
            fetch("/api/accompagnateurs", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nom: contact.nom, telephone: contact.numero }),
            }).then(() => {}),
          );
        }
      }
    });

    await Promise.all(updatePromises);

    if (updatePromises.length > 0) {
      reloadOfficiels();
      reloadEncadrants();
      reloadAccompagnateurs();
    }

    const success = await saveExtras(formData);
    if (success) {
      onSave();
      onClose();
    }
  }, [
    formData,
    match.id,
    match.date,
    match.time,
    saveExtras,
    onSave,
    onClose,
    officiels,
    encadrants,
    accompagnateurs,
    reloadOfficiels,
    reloadEncadrants,
    reloadAccompagnateurs,
  ]);

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
            onContactsChange={(contacts) => setFormData({ ...formData, arbitreTouche: contacts })}
            onAddOfficiel={handleAddOfficiel}
            placeholder="Sélectionner un arbitre AFP"
            label="Arbitres AFP"
          />

          <ContactListEditor
            contacts={formData.contactEncadrants || []}
            officiels={encadrants}
            onContactsChange={(contacts) => setFormData({ ...formData, contactEncadrants: contacts })}
            onAddOfficiel={handleAddEncadrant}
            placeholder="Sélectionner un encadrant"
            label="Encadrants"
          />

          <ContactListEditor
            contacts={formData.contactAccompagnateur || []}
            officiels={accompagnateurs}
            onContactsChange={(contacts) => setFormData({ ...formData, contactAccompagnateur: contacts })}
            onAddOfficiel={handleAddAccompagnateur}
            placeholder="Sélectionner un accompagnateur"
            label="Accompagnateurs"
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
