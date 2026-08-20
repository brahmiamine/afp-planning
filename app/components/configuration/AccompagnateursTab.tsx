'use client';

import { Users } from 'lucide-react';
import { PersonReferentialTab } from './PersonReferentialTab';
import { useAccompagnateurs } from '@/app/hooks/useAccompagnateurs';

export function AccompagnateursTab() {
  const { accompagnateurs, isLoading, reload } = useAccompagnateurs();

  return (
    <PersonReferentialTab
      icon={Users}
      title="Accompagnateurs"
      description="Gérez la liste des accompagnateurs et leurs indisponibilités"
      searchPlaceholder="Rechercher un accompagnateur..."
      emptyLabel="Aucun accompagnateur enregistré"
      singularLabel="accompagnateur"
      idPrefix="accompagnateur"
      apiEndpoint="/api/accompagnateurs"
      people={accompagnateurs}
      isLoading={isLoading}
      reload={reload}
    />
  );
}
