'use client';

import { memo } from 'react';
import { OfficielCard } from './OfficielCard';
import { OfficielAssignPopover } from './OfficielAssignPopover';
import { Officiel } from '@/hooks/useOfficiels';
import { Match, Entrainement, Plateau } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';

type Event = Match | Entrainement | Plateau;

interface OfficielCardWithPopoverProps {
  officiel: Officiel;
  events: Record<string, Event[]>;
  allExtras?: Record<string, MatchExtras>;
  onDelete: (nom: string) => void;
  isDeleting?: boolean;
  onEventUpdate: () => void;
}

export const OfficielCardWithPopover = memo(function OfficielCardWithPopover({
  officiel,
  events,
  allExtras,
  onDelete,
  isDeleting,
  onEventUpdate,
}: OfficielCardWithPopoverProps) {
  return (
    <OfficielAssignPopover
      officiel={officiel}
      events={events}
      allExtras={allExtras}
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
