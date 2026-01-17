'use client';

import { Match } from '@/types/match';
import MatchCard from './MatchCard';

interface MatchListProps {
  matches: Record<string, Match[]>;
}

export default function MatchList({ matches }: MatchListProps) {
  const sortedDates = Object.keys(matches).sort((a, b) => {
    const [dayA, monthA, yearA] = a.split('/').map(Number);
    const [dayB, monthB, yearB] = b.split('/').map(Number);
    const dateA = new Date(yearA, monthA - 1, dayA);
    const dateB = new Date(yearB, monthB - 1, dayB);
    return dateA.getTime() - dateB.getTime();
  });

  if (sortedDates.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">Aucun match trouvé</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sortedDates.map((date) => (
        <div key={date} className="space-y-4">
          <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold">{date}</h2>
            <p className="text-sm opacity-90">{matches[date].length} match{matches[date].length > 1 ? 'es' : ''}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matches[date].map((match, index) => (
              <MatchCard key={`${date}-${index}`} match={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
