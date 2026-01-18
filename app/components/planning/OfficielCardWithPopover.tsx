'use client';

import { memo } from 'react';
import { OfficielCard } from './OfficielCard';
import { OfficielAssignPopover } from './OfficielAssignPopover';
import { Officiel } from '@/hooks/useOfficiels';
import { Match, Entrainement, Plateau } from '@/types/match';

type Event = Match | Entrainement | Plateau;

interface OfficielCardWithPopoverProps {
  officiel: Officiel;
  events: Record<string, Event[]>;
  onDelete: (nom: string) => void;
  isDeleting?: boolean;
  onEventUpdate: () => void;
}

export const OfficielCardWithPopover = memo(function OfficielCardWithPopover({
  officiel,
  events,
  onDelete,
  isDeleting,
  onEventUpdate,
}: OfficielCardWithPopoverProps) {
  return (
    <OfficielAssignPopover
      officiel={officiel}
      events={events}
      onAssign={onEventUpdate}
    >
      <div>
        <OfficielCard
          officiel={officiel}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      </div>
    </OfficielAssignPopover>
  );
});
