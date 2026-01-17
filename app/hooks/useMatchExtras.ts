'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '@/lib/utils/api';

/**
 * Interface pour les informations supplémentaires d'un match
 */
export interface MatchExtras {
  id: string;
  confirmed?: boolean; // Match confirmé et bien rempli
  arbitreTouche?: string;
  contactEncadrants?: {
    nom: string;
    numero: string;
  };
  contactAccompagnateur?: {
    nom: string;
    numero: string;
  };
}

/**
 * Hook personnalisé pour gérer les informations supplémentaires d'un match
 */
export function useMatchExtras(matchId: string | undefined) {
  const [extras, setExtras] = useState<MatchExtras | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExtras = useCallback(async () => {
    if (!matchId) {
      setExtras(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await apiGet<MatchExtras | null>(`/api/matches/${matchId}`);
      setExtras(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement';
      setError(errorMessage);
      console.error('Erreur lors du chargement des extras:', err);
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  const saveExtras = useCallback(async (extrasData: MatchExtras): Promise<boolean> => {
    if (!matchId) {
      throw new Error('ID de match manquant');
    }

    try {
      setIsLoading(true);
      setError(null);
      const extrasToSave = {
        ...extrasData,
        id: matchId,
      };
      await apiPut(`/api/matches/${matchId}`, extrasToSave);
      await loadExtras(); // Recharger après sauvegarde
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      setError(errorMessage);
      console.error('Erreur lors de la sauvegarde:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [matchId, loadExtras]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  return {
    extras,
    isLoading,
    error,
    reload: loadExtras,
    save: saveExtras,
  };
}
