'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/utils/api';
import { MatchExtras } from './useMatchExtras';

/**
 * Hook pour charger tous les extras de tous les matchs
 */
export function useAllMatchExtras() {
  const [allExtras, setAllExtras] = useState<Record<string, MatchExtras>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAllExtras = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiGet<Record<string, MatchExtras>>('/api/matches-extras');
      setAllExtras(data || {});
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement';
      setError(errorMessage);
      console.error('Erreur lors du chargement des extras:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllExtras();
  }, [loadAllExtras]);

  return {
    allExtras,
    isLoading,
    error,
    reload: loadAllExtras,
  };
}
