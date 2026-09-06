'use client';

import { CheckCircle2 } from 'lucide-react';
import { memo } from 'react';
import { Match } from '@/types/match';
import { useMatchExtras } from '@/hooks/useMatchExtras';
import { MatchCardHeader } from './MatchCardHeader';
import { MatchTeams } from './MatchTeams';
import { MatchDetails } from './MatchDetails';
import { Badge } from '@/components/ui/badge';

interface MatchCardProps {
  match: Match;
  onMatchUpdate?: () => void;
}

export const MatchCard = memo(function MatchCard({ match }: MatchCardProps) {
  const { extras } = useMatchExtras(match.id);

  return (
    <div className="bg-card rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-border relative">
      <MatchCardHeader match={match} extras={extras} />
      <div className="p-4 sm:p-6">
        <MatchTeams match={match} />
        <MatchDetails match={match} extras={extras} />
        {extras?.confirmed && (
          <div className="mt-4 pt-4 border-t flex items-center justify-end">
            <Badge variant="default">
              <CheckCircle2 className="w-3 h-3" />
              Complété
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
});
