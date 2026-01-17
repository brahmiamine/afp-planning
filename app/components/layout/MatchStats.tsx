'use client';

import { useMemo, memo } from 'react';
import { Calendar, Home, Plane } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { calculateDetailedMatchStats } from '@/lib/utils/match';
import { Match } from '@/types/match';

interface MatchStatsProps {
  matches: Record<string, Match[]>;
}

export const MatchStats = memo(function MatchStats({ matches }: MatchStatsProps) {
  const stats = useMemo(() => calculateDetailedMatchStats(matches), [matches]);

  return (
    <div className="mb-4 sm:mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      <Card className="p-3 sm:p-4 border-l-4 border-l-primary">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-muted rounded-lg flex-shrink-0">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.totalMatches}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">Matchs au total</p>
          </div>
        </div>
      </Card>

      <Card className="p-3 sm:p-4 border-l-4 border-l-primary">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-muted rounded-lg flex-shrink-0">
            <Home className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.homeMatches}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">Matchs à domicile</p>
          </div>
        </div>
      </Card>

      <Card className="p-3 sm:p-4 border-l-4 border-l-primary sm:col-span-2 lg:col-span-1">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-muted rounded-lg flex-shrink-0">
            <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.awayMatches}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">Matchs à l'extérieur</p>
          </div>
        </div>
      </Card>
    </div>
  );
});
