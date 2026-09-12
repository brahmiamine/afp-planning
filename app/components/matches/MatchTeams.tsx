'use client';

import { Clock } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Match } from '@/types/match';
import { TeamLogo } from '../ui/team-logo';
import { useClubs } from '@/hooks/useClubs';
import { useAppSettings } from '@/hooks/useAppSettings';
import { resolveMatchLogos } from '@/lib/utils/match';

interface MatchTeamsProps {
  match: Match;
}

export const MatchTeams = memo(function MatchTeams({ match }: MatchTeamsProps) {
  const { clubs } = useClubs();
  const { settings } = useAppSettings();

  // Récupérer les logos : logos du match (scraper), puis club de l'utilisateur,
  // puis recherche tolérante dans la liste des clubs connus.
  const { localTeamLogo, awayTeamLogo } = useMemo(
    () =>
      resolveMatchLogos(match, clubs, {
        name: settings.clubName,
        logo: settings.clubLogo,
      }),
    [match, clubs, settings.clubName, settings.clubLogo],
  );

  return (
    <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
      <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
        <TeamLogo
          logo={localTeamLogo}
          name={match.localTeam}
          size={40}
          className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
        />
        <p className="max-w-full text-pretty text-xs font-semibold leading-snug text-foreground sm:text-sm">
          {match.localTeam}
        </p>
      </div>

      <div className="flex flex-col items-center px-1 pt-1">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">VS</span>
        <div className="mt-1 flex items-center gap-1 text-primary">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm font-bold tabular-nums sm:text-base">{match.time}</span>
        </div>
        {match.horaireRendezVous && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">RDV {match.horaireRendezVous}</div>
        )}
      </div>

      <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
        <TeamLogo
          logo={awayTeamLogo}
          name={match.awayTeam}
          size={40}
          className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
        />
        <p className="max-w-full text-pretty text-xs font-semibold leading-snug text-foreground sm:text-sm">
          {match.awayTeam}
        </p>
      </div>
    </div>
  );
});
