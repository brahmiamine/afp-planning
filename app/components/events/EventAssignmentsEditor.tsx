'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/app/components/ui/button';
import { ContactListEditor } from '@/app/components/ui/contact-list-editor';
import { useMatchAssignmentsEditor } from '@/hooks/useMatchAssignmentsEditor';
import { useEncadrants } from '@/app/hooks/useEncadrants';
import { apiPut } from '@/lib/utils/api';
import { roleLabelWithClub } from '@/lib/settings';
import type { ContactOfficiel } from '@/hooks/useMatchExtras';
import type { Match } from '@/types/match';

interface EventAssignmentsEditorProps {
  /** Match (officiel/amical) à éditer, ou `null` pour un entraînement/plateau. */
  matchPayload: Match | null;
  /** Identifiant de l'événement (requis pour entraînement/plateau). */
  eventId: string;
  isPlateau: boolean;
  initialEncadrants: ContactOfficiel[];
  clubAbbr: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

/**
 * Formulaire d'édition des affectations d'un événement. Isolé dans son propre
 * composant : il s'appuie sur des hooks (officiels / encadrants / accompagnateurs,
 * extras de match) qui interrogent des API réservées aux rôles d'écriture. Il ne
 * doit donc être monté que pour un utilisateur autorisé à gérer l'événement —
 * jamais dans l'espace événement personnel d'un arbitre, sous peine de 403.
 */
export function EventAssignmentsEditor({
  matchPayload,
  eventId,
  isPlateau,
  initialEncadrants,
  clubAbbr,
  onCancel,
  onSaved,
}: EventAssignmentsEditorProps) {
  if (matchPayload) {
    return (
      <MatchAssignmentsForm matchPayload={matchPayload} clubAbbr={clubAbbr} onCancel={onCancel} onSaved={onSaved} />
    );
  }
  return (
    <SimpleEncadrantsForm
      eventId={eventId}
      isPlateau={isPlateau}
      initialEncadrants={initialEncadrants}
      clubAbbr={clubAbbr}
      onCancel={onCancel}
      onSaved={onSaved}
    />
  );
}

function MatchAssignmentsForm({
  matchPayload,
  clubAbbr,
  onCancel,
  onSaved,
}: {
  matchPayload: Match;
  clubAbbr: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const assignmentsEditor = useMatchAssignmentsEditor(matchPayload);

  const save = async () => {
    const success = await assignmentsEditor.handleSave();
    if (success) {
      toast.success('Affectations mises à jour');
      await onSaved();
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <ContactListEditor
        contacts={assignmentsEditor.formData.arbitreTouche || []}
        officiels={assignmentsEditor.officiels}
        assignmentType="officiel"
        onContactsChange={(contacts) => assignmentsEditor.setFormData({ ...assignmentsEditor.formData, arbitreTouche: contacts })}
        placeholder={`Sélectionner un arbitre ${clubAbbr}`.trim()}
        label={roleLabelWithClub('Arbitres', clubAbbr)}
      />
      <ContactListEditor
        contacts={assignmentsEditor.formData.contactEncadrants || []}
        officiels={assignmentsEditor.encadrants}
        assignmentType="encadrant"
        onContactsChange={(contacts) => assignmentsEditor.setFormData({ ...assignmentsEditor.formData, contactEncadrants: contacts })}
        placeholder={`Sélectionner un encadrant ${clubAbbr}`.trim()}
        label={roleLabelWithClub('Encadrants', clubAbbr)}
      />
      <ContactListEditor
        contacts={assignmentsEditor.formData.contactAccompagnateur || []}
        officiels={assignmentsEditor.accompagnateurs}
        assignmentType="accompagnateur"
        onContactsChange={(contacts) => assignmentsEditor.setFormData({ ...assignmentsEditor.formData, contactAccompagnateur: contacts })}
        placeholder={`Sélectionner un accompagnateur ${clubAbbr}`.trim()}
        label={roleLabelWithClub('Accompagnateurs', clubAbbr)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={assignmentsEditor.isLoading}>
          {assignmentsEditor.isLoading ? 'Enregistrement...' : 'Enregistrer les affectations'}
        </Button>
      </div>
    </div>
  );
}

function SimpleEncadrantsForm({
  eventId,
  isPlateau,
  initialEncadrants,
  clubAbbr,
  onCancel,
  onSaved,
}: {
  eventId: string;
  isPlateau: boolean;
  initialEncadrants: ContactOfficiel[];
  clubAbbr: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { encadrants } = useEncadrants();
  const [form, setForm] = useState<ContactOfficiel[]>(initialEncadrants);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      await apiPut(isPlateau ? '/api/plateaux' : '/api/entrainements', { id: eventId, encadrants: form });
      toast.success('Encadrants mis à jour');
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de mettre à jour les encadrants');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <ContactListEditor
        contacts={form}
        officiels={encadrants}
        assignmentType="encadrant"
        onContactsChange={setForm}
        placeholder={`Sélectionner un encadrant ${clubAbbr}`.trim()}
        label={roleLabelWithClub('Encadrants', clubAbbr)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer les affectations'}
        </Button>
      </div>
    </div>
  );
}
