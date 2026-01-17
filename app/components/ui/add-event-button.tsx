'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Gamepad2, Dumbbell, Trophy } from 'lucide-react';
import { AddEventDialog, EventType } from './add-event-dialog';

interface AddEventButtonProps {
  onEventAdded: () => void;
}

export function AddEventButton({ onEventAdded }: AddEventButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventType, setEventType] = useState<EventType>('amical');

  const handleSelectEventType = (type: EventType) => {
    setEventType(type);
    setDialogOpen(true);
  };

  const handleSuccess = () => {
    onEventAdded();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-9 sm:h-10 px-3 sm:px-6 text-xs sm:text-sm w-full sm:w-auto">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
            Ajouter
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => handleSelectEventType('amical')}>
            <Gamepad2 className="w-4 h-4 mr-2" />
            Match amical
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSelectEventType('entrainement')}>
            <Dumbbell className="w-4 h-4 mr-2" />
            Entraînement
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSelectEventType('plateau')}>
            <Trophy className="w-4 h-4 mr-2" />
            Plateau
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddEventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        eventType={eventType}
        onSuccess={handleSuccess}
      />
    </>
  );
}
