'use client';

import { Clock } from 'lucide-react';
import { memo } from 'react';
import { Match } from '@/types/match';
import { TeamLogo } from '../ui/TeamLogo';

interface MatchTeamsProps {
  match: Match;
}

export const MatchTeams = memo(function MatchTeams({ match }: MatchTeamsProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      {/* Équipe locale */}
      <div className="flex-1 text-center">
        <div className="flex justify-center mb-3">
          <TeamLogo
            logo={match.localTeamLogo}
            name={match.localTeam}
            size={64}
            className="w-16 h-16"
          />
        </div>
        <p className="font-semibold text-gray-800 text-sm">{match.localTeam}</p>
      </div>

      {/* VS */}
      <div className="px-4">
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-gray-400">VS</span>
          <div className="mt-2 text-center">
            <div className="flex items-center gap-2 text-blue-600">
              <Clock className="w-4 h-4" />
              <span className="font-bold text-lg">{match.time}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">RDV: {match.horaireRendezVous}</div>
          </div>
        </div>
      </div>

      {/* Équipe adverse */}
      <div className="flex-1 text-center">
        <div className="flex justify-center mb-3">
          <TeamLogo
            logo={match.awayTeamLogo}
            name={match.awayTeam}
            size={64}
            className="w-16 h-16"
          />
        </div>
        <p className="font-semibold text-gray-800 text-sm">{match.awayTeam}</p>
      </div>
    </div>
  );
});
