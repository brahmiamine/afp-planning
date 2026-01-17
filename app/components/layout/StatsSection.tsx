'use client';

import { useMemo, memo } from 'react';
import { Calendar } from 'lucide-react';
import { StatsCard } from '../ui/StatsCard';
import { calculateMatchStats } from '@/lib/utils/match';
import { Match } from '@/types/match';

interface StatsSectionProps {
  matches: Record<string, Match[]>;
}

export const StatsSection = memo(function StatsSection({ matches }: StatsSectionProps) {
  const stats = useMemo(() => calculateMatchStats(matches), [matches]);

  return (
    <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatsCard
        title="Dates"
        value={stats.totalDates}
        icon={<Calendar className="w-8 h-8 text-blue-500" />}
        borderColor="blue"
      />
      <StatsCard
        title="Matchs au total"
        value={stats.totalMatches}
        borderColor="green"
      />
      <StatsCard
        title="Prochain match"
        value={stats.firstDateMatches}
        borderColor="purple"
      />
    </div>
  );
});
