'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/utils/api';
import { OfficielIndisponibilite } from '@/lib/utils/officiel-availability';

export interface Accompagnateur {
    nom: string;
    telephone?: string;
    indisponibilites?: OfficielIndisponibilite[];
}

interface AccompagnateursData {
    accompagnateurs: Accompagnateur[];
}

export function useAccompagnateurs() {
    const [accompagnateurs, setAccompagnateurs] = useState<Accompagnateur[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadAccompagnateurs = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await apiGet<AccompagnateursData>('/api/accompagnateurs');
            setAccompagnateurs(data.accompagnateurs || []);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement';
            setError(errorMessage);
            console.error('Erreur lors du chargement des accompagnateurs:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAccompagnateurs();
    }, [loadAccompagnateurs]);

    return {
        accompagnateurs,
        isLoading,
        error,
        reload: loadAccompagnateurs,
    };
}
