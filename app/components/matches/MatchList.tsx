'use client';

import { useMemo, memo } from 'react';
import { Match } from '@/types/match';
import { sortDates } from '@/lib/utils/date';
import { MatchCard } from './MatchCard';

interface MatchListProps {
  matches: Record<string, Match[]>;
  onMatchUpdate?: () => void;
}

export const MatchList = memo(function MatchList({ matches, onMatchUpdate }: MatchListProps) {
  const sortedDates = useMemo(() => sortDates(Object.keys(matches)), [matches]);

  if (sortedDates.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">Aucun match trouvé</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sortedDates.map((date) => {
        const matchList = matches[date];
        if (!matchList) return null;

        return (
          <div key={date} className="space-y-4">
            <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-6 py-3 rounded-lg shadow-md">
              <h2 className="text-2xl font-bold">{date}</h2>
              <p className="text-sm opacity-90">
                {matchList.length} match{matchList.length > 1 ? 'es' : ''}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {matchList.map((match, index) => (
                <MatchCard
                  key={`${date}-${index}-${match.id || index}`}
                  match={match}
                  onMatchUpdate={onMatchUpdate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
});
