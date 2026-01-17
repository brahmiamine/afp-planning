'use client';

import { useMemo, memo } from 'react';
import { Match } from '@/types/match';
import { sortDates, formatDateWithDayName } from '@/lib/utils/date';
import { MatchCard } from './MatchCard';
import { MatchListItem } from './MatchListItem';
import { ViewMode } from '../ui/view-toggle';

interface MatchListProps {
  matches: Record<string, Match[]>;
  view: ViewMode;
  onMatchUpdate?: () => void;
}

export const MatchList = memo(function MatchList({ matches, view, onMatchUpdate }: MatchListProps) {
  const sortedDates = useMemo(() => sortDates(Object.keys(matches)), [matches]);

  if (sortedDates.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">Aucun match trouvé</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {sortedDates.map((date) => {
        const matchList = matches[date];
        if (!matchList) return null;

        return (
          <div key={date} className="space-y-3 sm:space-y-4">
            <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 sm:px-6 py-2 sm:py-3 rounded-lg shadow-md">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold break-words">{formatDateWithDayName(date)}</h2>
              <p className="text-xs sm:text-sm opacity-90">
                {matchList.length} match{matchList.length > 1 ? 'es' : ''}
              </p>
            </div>
            {view === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {matchList.map((match, index) => (
                  <MatchCard
                    key={`${date}-${index}-${match.id || index}`}
                    match={match}
                    onMatchUpdate={onMatchUpdate}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {matchList.map((match, index) => (
                  <MatchListItem
                    key={`${date}-${index}-${match.id || index}`}
                    match={match}
                    onMatchUpdate={onMatchUpdate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
