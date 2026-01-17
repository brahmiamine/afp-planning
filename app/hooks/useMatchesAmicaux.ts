'use client';

import { useState, useEffect, useCallback } from 'react';
import { MatchesAmicauxData } from '@/types/match';
import { apiGet } from '@/lib/utils/api';

export function useMatchesAmicaux() {
  const [matchesData, setMatchesData] = useState<MatchesAmicauxData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMatches = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiGet<MatchesAmicauxData>('/api/matches-amicaux');
      setMatchesData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des matchs amicaux';
      setError(errorMessage);
      console.error('Error loading matches amicaux:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  return {
    matchesData,
    isLoading,
    error,
    reload: loadMatches,
  };
}
