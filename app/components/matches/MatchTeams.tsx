'use client';

import { Clock } from 'lucide-react';
import { memo } from 'react';
import { Match } from '@/types/match';
import { TeamLogo } from '../ui/team-logo';

interface MatchTeamsProps {
  match: Match;
}

export const MatchTeams = memo(function MatchTeams({ match }: MatchTeamsProps) {
  return (
    <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2 sm:gap-4">
      {/* Équipe locale */}
      <div className="flex-1 text-center min-w-0">
        <div className="flex justify-center mb-2 sm:mb-3">
          <TeamLogo
            logo={match.localTeamLogo}
            name={match.localTeam}
            size={64}
            className="w-12 h-12 sm:w-16 sm:h-16"
          />
        </div>
        <p className="font-semibold text-foreground text-xs sm:text-sm truncate px-1">{match.localTeam}</p>
      </div>

      {/* VS */}
      <div className="px-2 sm:px-4 flex-shrink-0">
        <div className="flex flex-col items-center">
          <span className="text-lg sm:text-2xl font-bold text-muted-foreground">VS</span>
          <div className="mt-1 sm:mt-2 text-center">
            <div className="flex items-center gap-1 sm:gap-2 text-primary">
              <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="font-bold text-sm sm:text-lg">{match.time}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 sm:mt-1">RDV: {match.horaireRendezVous}</div>
          </div>
        </div>
      </div>

      {/* Équipe adverse */}
      <div className="flex-1 text-center min-w-0">
        <div className="flex justify-center mb-2 sm:mb-3">
          <TeamLogo
            logo={match.awayTeamLogo}
            name={match.awayTeam}
            size={64}
            className="w-12 h-12 sm:w-16 sm:h-16"
          />
        </div>
        <p className="font-semibold text-foreground text-xs sm:text-sm truncate px-1">{match.awayTeam}</p>
      </div>
    </div>
  );
});
