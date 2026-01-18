'use client';

import { useState, useEffect, useCallback } from 'react';
import { EntrainementsData } from '@/types/match';
import { apiGet } from '@/lib/utils/api';

export function useEntrainements() {
  const [data, setData] = useState<EntrainementsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntrainements = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Ajouter un timestamp pour éviter le cache
      const response = await apiGet<EntrainementsData>(`/api/entrainements?t=${Date.now()}`);
      setData(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des entraînements';
      setError(errorMessage);
      console.error('Error loading entrainements:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntrainements();
  }, [loadEntrainements]);

  return {
    data,
    isLoading,
    error,
    reload: loadEntrainements,
  };
}
