"use client";

import { X } from "lucide-react";
import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OfficielCombobox, Officiel } from "@/components/ui/officiel-combobox";
import { ContactOfficiel } from "@/hooks/useMatchExtras";
import type { PersonType } from "@/types/match";
import { cn } from "@/lib/utils";

interface ContactListEditorProps {
  contacts: ContactOfficiel[];
  officiels: Officiel[];
  onContactsChange: (contacts: ContactOfficiel[]) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  assignmentType?: PersonType;
}

function samePerson(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export const ContactListEditor = memo(function ContactListEditor({
  contacts,
  officiels,
  onContactsChange,
  placeholder = "Sélectionner un officiel...",
  label = "Contact",
  className = "",
  assignmentType = "officiel",
}: ContactListEditorProps) {
  const assigned = useMemo(
    () => contacts.filter((contact) => contact.nom.trim()),
    [contacts],
  );

  const available = useMemo(
    () => officiels.filter((officiel) => !assigned.some((contact) => samePerson(contact.nom, officiel.nom))),
    [officiels, assigned],
  );

  const addOfficiel = (value: string, selected?: Officiel | null) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const matched = selected ?? officiels.find((officiel) => samePerson(officiel.nom, trimmed));
    if (!matched) return;
    if (assigned.some((contact) => samePerson(contact.nom, matched.nom))) return;
    onContactsChange([
      ...assigned,
      {
        nom: matched.nom,
        numero: matched.telephone || "",
        personId: matched.id,
        personType: matched.id ? assignmentType : undefined,
      },
    ]);
  };

  const removeContact = (index: number) => {
    onContactsChange(assigned.filter((_, current) => current !== index));
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="min-h-12.5 rounded-md border bg-muted/30 p-2">
        {assigned.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {assigned.map((contact, index) => (
              <Badge key={`${contact.personId ?? contact.nom}-${index}`} variant="secondary" className="flex items-center gap-0.5 px-1.5 py-0 h-6">
                <span className="truncate max-w-40">{contact.nom}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 min-h-6 min-w-6 p-0"
                  onClick={() => removeContact(index)}
                  aria-label={`Retirer ${contact.nom}`}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="py-1.5 text-center text-xs text-muted-foreground">Aucun dirigeant affecté</p>
        )}
        <div className="mt-1.5">
          <OfficielCombobox
            officiels={available}
            value=""
            onValueChange={(value) => addOfficiel(value)}
            onOfficielChange={(officiel) => addOfficiel(officiel?.nom ?? "", officiel)}
            placeholder={placeholder}
            className="h-9 text-sm"
          />
        </div>
      </div>
    </div>
  );
});
