'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/utils/api';

export interface Stade {
  nom: string;
  adresse: string | null;
  googleMapsUrl: string;
}

export interface StadesData {
  stades: Stade[];
}

export function useStades() {
  const [stades, setStades] = useState<Stade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStades = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiGet<StadesData>('/api/stades');
      setStades(data.stades || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des stades';
      setError(errorMessage);
      console.error('Error loading stades:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStades();
  }, [loadStades]);

  return {
    stades,
    isLoading,
    error,
    reload: loadStades,
  };
}
