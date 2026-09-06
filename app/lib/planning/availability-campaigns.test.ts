import { describe, expect, it } from 'vitest';
import { availabilityCampaignClosesAt, isAvailabilityCampaignClosed } from './availability-campaigns';

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0); // 15/09/2026 12:00 UTC

describe('availabilityCampaignClosesAt (issue #87)', () => {
  it('utilise closesAt lorsqu’il est renseigné', () => {
    const closesAt = '2026-09-10T20:00:00.000Z';
    expect(availabilityCampaignClosesAt({ endDate: '2026-09-30', closesAt }, 'UTC')).toBe(Date.parse(closesAt));
  });

  it('sans closesAt, clôt à la fin de la période (23:59, fuseau du club)', () => {
    expect(availabilityCampaignClosesAt({ endDate: '2026-09-20', closesAt: null }, 'UTC'))
      .toBe(Date.UTC(2026, 8, 20, 23, 59, 0));
  });

  it('retourne null lorsque la date est indéterminable', () => {
    expect(availabilityCampaignClosesAt({ endDate: 'pas-une-date', closesAt: null }, 'UTC')).toBeNull();
    expect(availabilityCampaignClosesAt({ endDate: '2026-09-20', closesAt: 'invalide' }, 'UTC')).toBeNull();
  });

  it('la fin de période tient compte du fuseau du club', () => {
    const utc = availabilityCampaignClosesAt({ endDate: '2026-06-20', closesAt: null }, 'UTC');
    const losAngeles = availabilityCampaignClosesAt({ endDate: '2026-06-20', closesAt: null }, 'America/Los_Angeles');
    expect(utc).not.toBeNull();
    expect(losAngeles).not.toBeNull();
    // 23:59 à Los Angeles correspond à un instant UTC plus tardif que 23:59 UTC.
    expect((losAngeles ?? 0) > (utc ?? 0)).toBe(true);
  });
});

describe('isAvailabilityCampaignClosed (issue #87)', () => {
  it('une campagne avec closesAt passé est clôturée', () => {
    expect(isAvailabilityCampaignClosed(
      { endDate: '2026-09-30', closesAt: '2026-09-10T20:00:00.000Z' }, 'UTC', NOW,
    )).toBe(true);
  });

  it('un closesAt futur prime sur une période terminée : la campagne reste ouverte', () => {
    expect(isAvailabilityCampaignClosed(
      { endDate: '2026-09-10', closesAt: '2026-09-30T20:00:00.000Z' }, 'UTC', NOW,
    )).toBe(false);
  });

  it('sans closesAt, une campagne dont la période est terminée est clôturée', () => {
    expect(isAvailabilityCampaignClosed({ endDate: '2026-09-14', closesAt: null }, 'UTC', NOW)).toBe(true);
  });

  it('sans closesAt, une campagne dont le dernier jour est en cours reste ouverte', () => {
    expect(isAvailabilityCampaignClosed({ endDate: '2026-09-15', closesAt: null }, 'UTC', NOW)).toBe(false);
  });

  it('sans closesAt, une campagne future reste ouverte', () => {
    expect(isAvailabilityCampaignClosed({ endDate: '2026-09-30', closesAt: null }, 'UTC', NOW)).toBe(false);
  });

  it('une campagne à la date indéterminable reste ouverte (on ne bloque pas sans vérification)', () => {
    expect(isAvailabilityCampaignClosed({ endDate: '??', closesAt: null }, 'UTC', NOW)).toBe(false);
  });
});
