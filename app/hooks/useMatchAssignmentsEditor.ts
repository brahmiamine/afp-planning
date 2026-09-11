'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMatchExtras, MatchExtras } from '@/hooks/useMatchExtras';
import { useOfficiels } from '@/hooks/useOfficiels';
import { useEncadrants } from '@/hooks/useEncadrants';
import { useAccompagnateurs } from '@/hooks/useAccompagnateurs';
import { getOfficielAvailabilityStatus } from '@/lib/utils/officiel-availability';
import { toast } from 'sonner';

interface MatchLike {
  id?: string;
  date: string;
  time: string;
}

/**
 * Logique partagée d'édition des affectations (arbitre AFP, encadrants, accompagnateurs)
 * d'un match. Utilisée à la fois par la modale d'édition (MatchEditor) et par l'espace
 * événement en page complète, pour garantir un comportement identique aux deux endroits.
 */
export function useMatchAssignmentsEditor(match: MatchLike | null | undefined) {
  const { extras, save: saveExtras, isLoading, reload } = useMatchExtras(match?.id);
  const { officiels } = useOfficiels();
  const { encadrants } = useEncadrants();
  const { accompagnateurs } = useAccompagnateurs();
  const [formData, setFormData] = useState<MatchExtras>({
    id: match?.id || '',
    confirmed: false,
    arbitreTouche: [],
    contactEncadrants: [],
    contactAccompagnateur: [],
  });

  useEffect(() => {
    if (extras) {
      setFormData({
        id: match?.id || '',
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
  }, [extras, match?.id]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!match?.id) {
      toast.error("Erreur : l'ID du match est manquant");
      return false;
    }

    const roleContacts = [
      { role: 'officiel', contacts: formData.arbitreTouche || [], source: officiels },
      { role: 'encadrant', contacts: formData.contactEncadrants || [], source: encadrants },
      { role: 'accompagnateur', contacts: formData.contactAccompagnateur || [], source: accompagnateurs },
    ] as const;

    for (const roleEntry of roleContacts) {
      for (const selectedContact of roleEntry.contacts) {
        if (!selectedContact?.nom) continue;

        const person = roleEntry.source.find((item) => item.nom.toLowerCase() === selectedContact.nom.toLowerCase());
        if (!person) continue;

        const availability = getOfficielAvailabilityStatus(person, match.date, match.time);
        if (availability.unavailable) {
          toast.error(availability.message || `${person.nom} est indisponible pour ce match.`);
          return false;
        }
      }
    }

    return saveExtras(formData);
  }, [
    formData,
    match,
    saveExtras,
    officiels,
    encadrants,
    accompagnateurs,
  ]);

  return {
    formData,
    setFormData,
    officiels,
    encadrants,
    accompagnateurs,
    handleSave,
    isLoading,
    reload,
  };
}
