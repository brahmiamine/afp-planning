'use client';

import { Calendar, Trophy, Edit } from 'lucide-react';
import { memo } from 'react';
import { Match } from '@/types/match';
import { getVenueClasses } from '@/lib/utils/match';
import { Button } from '@/components/ui/button';

interface MatchCardHeaderProps {
  match: Match;
  onEdit: () => void;
}

export const MatchCardHeader = memo(function MatchCardHeader({
  match,
  onEdit,
}: MatchCardHeaderProps) {
  const venueClasses = getVenueClasses(match.venue);

  return (
    <div className="bg-primary text-primary-foreground p-3 sm:p-4 relative">
      <Button
        onClick={onEdit}
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 sm:top-3 sm:right-3 h-8 w-8 sm:h-9 sm:w-9 bg-white/20 hover:bg-white/30 rounded-full z-0 backdrop-blur-sm text-white hover:text-white"
        title="Modifier le match"
        aria-label="Modifier le match"
      >
        <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-2 pr-10 sm:pr-12">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="font-semibold text-sm sm:text-base truncate">{match.date}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-shrink-0">
          {match.type && (
            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-semibold bg-white/20 capitalize whitespace-nowrap">
              {match.type}
            </span>
          )}
          <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold whitespace-nowrap ${venueClasses}`}>
            {match.venue === 'domicile' ? '🏠 Domicile' : '✈️ Extérieur'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-0 pr-10 sm:pr-12">
        <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
        <span className="text-xs sm:text-sm opacity-90 truncate">{match.competition}</span>
      </div>
    </div>
  );
});
