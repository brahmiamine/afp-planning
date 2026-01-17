'use client';

import { LayoutGrid, List } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ViewMode = 'card' | 'list';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export const ViewToggle = memo(function ViewToggle({
  view,
  onViewChange,
  className = '',
}: ViewToggleProps) {
  return (
    <div className={cn('flex items-center gap-2 border border-border rounded-lg p-1 bg-muted', className)}>
      <Button
        variant={view === 'card' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('card')}
        className="flex items-center gap-2"
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="hidden sm:inline">Cartes</span>
      </Button>
      <Button
        variant={view === 'list' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('list')}
        className="flex items-center gap-2"
      >
        <List className="w-4 h-4" />
        <span className="hidden sm:inline">Liste</span>
      </Button>
    </div>
  );
});
