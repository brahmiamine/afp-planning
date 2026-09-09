'use client';

import { LayoutGrid, List, CalendarDays } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ViewMode = 'card' | 'list' | 'calendar';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
  /** Affiche le bouton « Calendrier » (par défaut : true). */
  showCalendar?: boolean;
}

export const ViewToggle = memo(function ViewToggle({
  view,
  onViewChange,
  className = '',
  showCalendar = true,
}: ViewToggleProps) {
  const options: Array<{ value: ViewMode; label: string; Icon: typeof LayoutGrid }> = [
    { value: 'card', label: 'Cartes', Icon: LayoutGrid },
    { value: 'list', label: 'Liste', Icon: List },
    ...(showCalendar ? [{ value: 'calendar' as const, label: 'Calendrier', Icon: CalendarDays }] : []),
  ];

  return (
    <div
      className={cn(
        // Hauteur alignée sur la cible tactile mobile (44px) pour éviter que le
        // bouton actif ne déborde du conteneur ; segments pleins, sans marge.
        'inline-flex h-11 shrink-0 items-stretch overflow-hidden rounded-lg border border-border bg-muted lg:h-10',
        className,
      )}
      role="group"
      aria-label="Mode d’affichage"
    >
      {options.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant={view === value ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={view === value}
          onClick={() => onViewChange(value)}
          className="h-full flex-1 gap-1.5 rounded-none border-0 px-3"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
});
