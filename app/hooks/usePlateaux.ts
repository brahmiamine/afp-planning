'use client';

import { useState, useEffect, useCallback } from 'react';
import { PlateauxData } from '@/types/match';
import { apiGet } from '@/lib/utils/api';

export function usePlateaux() {
  const [data, setData] = useState<PlateauxData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlateaux = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiGet<PlateauxData>('/api/plateaux');
      setData(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des plateaux';
      setError(errorMessage);
      console.error('Error loading plateaux:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlateaux();
  }, [loadPlateaux]);

  return {
    data,
    isLoading,
    error,
    reload: loadPlateaux,
  };
}
