import { describe, expect, it, vi } from 'vitest';
import { loadEventWorkspaceModules } from './event-workspace-loader';

const snapshot = {
  eventId: 'e-1',
  title: 'Entraînement test',
};

describe('chargement des modules optionnels de l’espace événement (issue #149)', () => {
  it('ne charge que le détail de base quand les modules optionnels sont désactivés', async () => {
    const apiGet = vi.fn(async () => snapshot);

    const result = await loadEventWorkspaceModules({
      base: '/api/planning/events/entrainement/e-1',
      withScope: (url) => url,
      collaborationEnabled: false,
      weatherEnabled: false,
      weatherUrl: '/api/planning/weather?eventType=entrainement&eventId=e-1',
      apiGet,
    });

    expect(result.snapshot).toEqual(snapshot);
    expect(result.collaboration).toBeNull();
    expect(result.reports).toBeNull();
    expect(result.attachments).toBeNull();
    expect(result.weather).toBeNull();
    expect(apiGet.mock.calls.map(([url]) => url)).toEqual([
      '/api/planning/events/entrainement/e-1',
    ]);
  });

  it('conserve le détail quand un module optionnel échoue', async () => {
    const apiGet = vi.fn(async (url: string) => {
      if (url.endsWith('/e-1')) return snapshot;
      if (url.includes('/collaboration')) throw new Error('Collaboration indisponible');
      if (url.includes('/reports')) return { reports: [], canSubmit: false };
      if (url.includes('/attachments')) return { attachments: [], canManage: false };
      return { available: false, provider: 'open-meteo' };
    });

    const result = await loadEventWorkspaceModules({
      base: '/api/planning/events/entrainement/e-1',
      withScope: (url) => url,
      collaborationEnabled: true,
      weatherEnabled: true,
      weatherUrl: '/api/planning/weather?eventType=entrainement&eventId=e-1',
      apiGet,
    });

    expect(result.snapshot).toEqual(snapshot);
    expect(result.collaboration).toBeNull();
    expect(result.reports).toEqual({ reports: [], canSubmit: false });
    expect(result.attachments).toEqual({ attachments: [], canManage: false });
    expect(result.weather).toEqual({ available: false, provider: 'open-meteo' });
  });

  it('fait échouer le chargement si le snapshot principal échoue', async () => {
    const apiGet = vi.fn(async (url: string) => {
      if (url.endsWith('/e-1')) throw new Error('Détail indisponible');
      return {};
    });

    await expect(loadEventWorkspaceModules({
      base: '/api/planning/events/entrainement/e-1',
      withScope: (url) => url,
      collaborationEnabled: true,
      weatherEnabled: true,
      weatherUrl: '/api/planning/weather?eventType=entrainement&eventId=e-1',
      apiGet,
    })).rejects.toThrow('Détail indisponible');
  });
});
