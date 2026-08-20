'use client';

import { Users } from 'lucide-react';
import { PersonReferentialTab } from './PersonReferentialTab';
import { useOfficiels } from '@/app/hooks/useOfficiels';

export function OfficielsTab() {
  const { officiels, isLoading, reload } = useOfficiels();

  return (
    <PersonReferentialTab
      icon={Users}
      title="Officiels"
      description="Gérez la liste des officiels et leurs numéros de téléphone"
      searchPlaceholder="Rechercher un officiel..."
      emptyLabel="Aucun officiel enregistré"
      singularLabel="officiel"
      idPrefix="officiel"
      apiEndpoint="/api/officiels"
      people={officiels}
      isLoading={isLoading}
      reload={reload}
    />
  );
}
