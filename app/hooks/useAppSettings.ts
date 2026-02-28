'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/utils/api';
import {
    DEFAULT_APP_SETTINGS,
    normalizeAppSettings,
    type AppSettings,
} from '@/lib/settings';

const APP_SETTINGS_UPDATED_EVENT = 'app-settings-updated';

export function useAppSettings() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadSettings = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await apiGet<AppSettings>('/api/settings');
            setSettings(normalizeAppSettings(response));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des paramètres';
            setError(errorMessage);
            setSettings(DEFAULT_APP_SETTINGS);
            console.error('Error loading app settings:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        const handleUpdate = (event: Event) => {
            const customEvent = event as CustomEvent<AppSettings>;
            if (!customEvent.detail) {
                return;
            }
            setSettings(normalizeAppSettings(customEvent.detail));
        };

        window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleUpdate as EventListener);
        return () => {
            window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleUpdate as EventListener);
        };
    }, []);

    const saveSettings = useCallback(async (nextSettings: AppSettings) => {
        const normalized = normalizeAppSettings(nextSettings);
        await apiPut<{ success: boolean; settings: AppSettings }>('/api/settings', normalized);
        setSettings(normalized);
        window.dispatchEvent(new CustomEvent<AppSettings>(APP_SETTINGS_UPDATED_EVENT, { detail: normalized }));
        return normalized;
    }, []);

    return {
        settings,
        isLoading,
        error,
        reload: loadSettings,
        saveSettings,
        setSettings,
    };
}
