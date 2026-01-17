'use client';

import { Calendar, Trophy, Edit } from 'lucide-react';
import { memo } from 'react';
import { Match } from '@/types/match';
import { getVenueClasses } from '@/lib/utils/match';

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
    <div className="bg-primary text-primary-foreground p-4 relative">
      <button
        onClick={onEdit}
        className="absolute top-2 right-2 p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors z-10 backdrop-blur-sm"
        title="Modifier le match"
        aria-label="Modifier le match"
      >
        <Edit className="w-4 h-4 text-white" />
      </button>

      <div className="flex items-center justify-between mb-2 pr-10">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          <span className="font-semibold">{match.date}</span>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${venueClasses}`}>
          {match.venue === 'domicile' ? '🏠 Domicile' : '✈️ Extérieur'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4" />
        <span className="text-sm opacity-90">{match.competition}</span>
      </div>
    </div>
  );
});
