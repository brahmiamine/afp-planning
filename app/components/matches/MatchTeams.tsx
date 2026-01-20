'use client';

import { Clock } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Match } from '@/types/match';
import { TeamLogo } from '../ui/team-logo';
import { useClubs } from '@/hooks/useClubs';

interface MatchTeamsProps {
  match: Match;
}

export const MatchTeams = memo(function MatchTeams({ match }: MatchTeamsProps) {
  const { clubs } = useClubs();

  // Récupérer les logos depuis la liste des clubs si non définis dans le match
  const localTeamLogo = useMemo(() => {
    if (match.localTeamLogo) return match.localTeamLogo;
    const club = clubs.find(c => c.nom === match.localTeam);
    return club?.logo;
  }, [match.localTeamLogo, match.localTeam, clubs]);

  const awayTeamLogo = useMemo(() => {
    if (match.awayTeamLogo) return match.awayTeamLogo;
    const club = clubs.find(c => c.nom === match.awayTeam);
    return club?.logo;
  }, [match.awayTeamLogo, match.awayTeam, clubs]);

  return (
    <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2 sm:gap-4">
      {/* Équipe locale - Logo à gauche du nom */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <TeamLogo
            logo={localTeamLogo}
            name={match.localTeam}
            size={48}
            className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0"
          />
          <p className="font-semibold text-foreground text-xs sm:text-sm truncate">{match.localTeam}</p>
        </div>
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

      {/* Équipe adverse - Logo à droite du nom */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <p className="font-semibold text-foreground text-xs sm:text-sm truncate">{match.awayTeam}</p>
          <TeamLogo
            logo={awayTeamLogo}
            name={match.awayTeam}
            size={48}
            className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0"
          />
        </div>
      </div>
    </div>
  );
});
