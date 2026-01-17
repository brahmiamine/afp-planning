'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/utils/api';

export interface Officiel {
  nom: string;
  telephone?: string;
}

interface OfficielsData {
  officiels: Officiel[];
}

/**
 * Hook pour charger la liste des officiels
 */
export function useOfficiels() {
  const [officiels, setOfficiels] = useState<Officiel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOfficiels = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiGet<OfficielsData>('/api/officiels');
      setOfficiels(data.officiels || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement';
      setError(errorMessage);
      console.error('Erreur lors du chargement des officiels:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOfficiels();
  }, [loadOfficiels]);

  return {
    officiels,
    isLoading,
    error,
    reload: loadOfficiels,
  };
}
