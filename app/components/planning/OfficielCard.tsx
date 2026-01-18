'use client';

import { useDraggable } from '@dnd-kit/core';
import { Trash2, UserPlus } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Officiel } from '@/hooks/useOfficiels';
import { cn } from '@/lib/utils';

interface OfficielCardProps {
  officiel: Officiel;
  onDelete: (nom: string) => void;
  isDeleting?: boolean;
  onQuickAssign?: () => void;
}

export const OfficielCard = memo(function OfficielCard({
  officiel,
  onDelete,
  isDeleting = false,
  onQuickAssign,
}: OfficielCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `officiel-${officiel.nom}`,
    data: {
      type: 'officiel',
      officiel,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'p-3 cursor-grab active:cursor-grabbing transition-all',
        isDragging && 'opacity-50 shadow-lg z-50',
        isDeleting && 'opacity-50'
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{officiel.nom}</p>
          {officiel.telephone && (
            <p className="text-xs text-muted-foreground truncate">
              {officiel.telephone}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {onQuickAssign && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAssign();
              }}
              title="Affecter rapidement"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(officiel.nom);
            }}
            disabled={isDeleting}
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </Card>
  );
});
