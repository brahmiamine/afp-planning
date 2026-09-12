'use client';

import { memo } from 'react';
import { Match } from '@/types/match';
import { useMatchExtras } from '@/hooks/useMatchExtras';
import { EventCardWeather } from '@/components/events/EventCardWeather';
import { MatchCardHeader } from './MatchCardHeader';
import { MatchTeams } from './MatchTeams';
import { MatchDetails } from './MatchDetails';

interface MatchCardProps {
  match: Match;
  onMatchUpdate?: () => void;
}

export const MatchCard = memo(function MatchCard({ match }: MatchCardProps) {
  const { extras } = useMatchExtras(match.id);

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-md transition-shadow duration-300 hover:shadow-lg">
      <MatchCardHeader match={match} extras={extras} />
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <MatchTeams match={match} />
        <EventCardWeather
          eventType={match.type === 'amical' ? 'amical' : 'officiel'}
          eventId={match.id}
          variant="inline"
          className="mb-3 flex w-full justify-center text-sm"
        />
        <MatchDetails match={match} extras={extras} />
      </div>
    </div>
  );
});
