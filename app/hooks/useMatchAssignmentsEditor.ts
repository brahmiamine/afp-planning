'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMatchExtras, MatchExtras } from '@/hooks/useMatchExtras';
import { useOfficiels } from '@/hooks/useOfficiels';
import { useEncadrants } from '@/hooks/useEncadrants';
import { useAccompagnateurs } from '@/hooks/useAccompagnateurs';
import { apiPut } from '@/lib/utils/api';
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
  const { officiels, reload: reloadOfficiels } = useOfficiels();
  const { encadrants, reload: reloadEncadrants } = useEncadrants();
  const { accompagnateurs, reload: reloadAccompagnateurs } = useAccompagnateurs();
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

  const handleAddOfficiel = useCallback(
    async (nom: string, telephone: string) => {
      await apiPut('/api/officiels', { nom, telephone });
      reloadOfficiels();
    },
    [reloadOfficiels],
  );

  const handleAddEncadrant = useCallback(
    async (nom: string, telephone: string) => {
      await apiPut('/api/encadrants', { nom, telephone });
      reloadEncadrants();
    },
    [reloadEncadrants],
  );

  const handleAddAccompagnateur = useCallback(
    async (nom: string, telephone: string) => {
      await apiPut('/api/accompagnateurs', { nom, telephone });
      reloadAccompagnateurs();
    },
    [reloadAccompagnateurs],
  );

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

    const updatePromises: Promise<void>[] = [];

    formData.arbitreTouche?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const officiel = officiels.find((item) => item.nom === contact.nom);
        if (!officiel?.telephone || officiel.telephone !== contact.numero) {
          updatePromises.push(apiPut('/api/officiels', { nom: contact.nom, telephone: contact.numero }));
        }
      }
    });

    formData.contactEncadrants?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const encadrant = encadrants.find((item) => item.nom === contact.nom);
        if (!encadrant?.telephone || encadrant.telephone !== contact.numero) {
          updatePromises.push(apiPut('/api/encadrants', { nom: contact.nom, telephone: contact.numero }));
        }
      }
    });

    formData.contactAccompagnateur?.forEach((contact) => {
      if (contact.nom && contact.numero) {
        const accompagnateur = accompagnateurs.find((item) => item.nom === contact.nom);
        if (!accompagnateur?.telephone || accompagnateur.telephone !== contact.numero) {
          updatePromises.push(apiPut('/api/accompagnateurs', { nom: contact.nom, telephone: contact.numero }));
        }
      }
    });

    await Promise.all(updatePromises);

    if (updatePromises.length > 0) {
      reloadOfficiels();
      reloadEncadrants();
      reloadAccompagnateurs();
    }

    return saveExtras(formData);
  }, [
    formData,
    match,
    saveExtras,
    officiels,
    encadrants,
    accompagnateurs,
    reloadOfficiels,
    reloadEncadrants,
    reloadAccompagnateurs,
  ]);

  return {
    formData,
    setFormData,
    officiels,
    encadrants,
    accompagnateurs,
    handleAddOfficiel,
    handleAddEncadrant,
    handleAddAccompagnateur,
    handleSave,
    isLoading,
    reload,
  };
}
