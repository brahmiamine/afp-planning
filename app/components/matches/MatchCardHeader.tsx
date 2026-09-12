'use client';

import { Calendar, Trophy } from 'lucide-react';
import { memo } from 'react';
import { Match } from '@/types/match';
import { getVenueClasses } from '@/lib/utils/match';
import { ShareMatchButton } from './ShareMatchButton';
import { MatchExtras } from '@/hooks/useMatchExtras';

interface MatchCardHeaderProps {
  match: Match;
  extras?: MatchExtras | null;
}

export const MatchCardHeader = memo(function MatchCardHeader({
  match,
  extras,
}: MatchCardHeaderProps) {
  const venueClasses = getVenueClasses(match.venue);

  return (
    <div className="relative bg-primary p-3 text-primary-foreground">
      <div className="absolute right-2 top-2 z-10">
        <ShareMatchButton
          match={match}
          extras={extras}
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-white/20 text-white hover:bg-white/30 hover:text-white rounded-full backdrop-blur-sm"
        />
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 pr-10">
        <Calendar className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold">{match.date}</span>
        {match.type && (
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold capitalize">
            {match.type}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${venueClasses}`}>
          {match.venue === 'domicile' ? '🏠 Domicile' : '✈️ Extérieur'}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2 pr-10">
        <Trophy className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-xs opacity-90">{match.competition}</span>
      </div>
    </div>
  );
});
