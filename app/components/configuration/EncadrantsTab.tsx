'use client';

import { Users } from 'lucide-react';
import { PersonReferentialTab } from './PersonReferentialTab';
import { useEncadrants } from '@/app/hooks/useEncadrants';

export function EncadrantsTab() {
  const { encadrants, isLoading, reload } = useEncadrants();

  return (
    <PersonReferentialTab
      icon={Users}
      title="Encadrants"
      description="Gérez la liste des encadrants et leurs indisponibilités"
      searchPlaceholder="Rechercher un encadrant..."
      emptyLabel="Aucun encadrant enregistré"
      singularLabel="encadrant"
      idPrefix="encadrant"
      apiEndpoint="/api/encadrants"
      people={encadrants}
      isLoading={isLoading}
      reload={reload}
    />
  );
}
