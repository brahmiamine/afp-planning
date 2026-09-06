import { describe, expect, it } from 'vitest';
import {
  isWithinPublicationWindow,
  publicationWindowPastDays,
  publicationWindowStart,
} from './published-planning';

describe('publication window (issue #42)', () => {
  it('démarre à J-7 à minuit, heure du club, par défaut', () => {
    // 20/08/2026 12:00 UTC = 14:00 à Paris (été). J-7 = 13/08/2026 00:00 Paris = 12/08 22:00 UTC.
    const now = Date.UTC(2026, 7, 20, 12, 0);
    expect(publicationWindowPastDays()).toBe(7);
    expect(publicationWindowStart(now, 'Europe/Paris', 7)).toBe(Date.UTC(2026, 7, 12, 22, 0));
  });

  it('garde les événements récents et futurs, exclut les plus anciens', () => {
    const now = Date.UTC(2026, 7, 20, 12, 0);
    const start = publicationWindowStart(now, 'Europe/Paris', 7);
    expect(isWithinPublicationWindow({ date: '13/08/2026', time: '10:00' }, start, 'Europe/Paris')).toBe(true);
    expect(isWithinPublicationWindow({ date: '20/09/2026', time: '15:00' }, start, 'Europe/Paris')).toBe(true);
    expect(isWithinPublicationWindow({ date: '12/08/2026', time: '23:00' }, start, 'Europe/Paris')).toBe(false);
  });

  it('garde un événement sans horaire exploitable dans la fenêtre (reste validé)', () => {
    const start = publicationWindowStart(Date.UTC(2026, 7, 20, 12, 0), 'Europe/Paris', 7);
    expect(isWithinPublicationWindow({ date: '??', time: '??' }, start, 'Europe/Paris')).toBe(true);
  });

  it('ne filtre rien si la fenêtre est incalculable', () => {
    expect(isWithinPublicationWindow({ date: '01/01/2020', time: '10:00' }, null, 'Europe/Paris')).toBe(true);
  });
});
