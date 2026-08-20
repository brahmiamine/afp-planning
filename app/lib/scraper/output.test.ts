import { describe, expect, it } from 'vitest';
import { SCRAPER_RESULT_PREFIX, parseScraperOutput } from './output';

describe('parseScraperOutput', () => {
  it('extracts the final structured result from noisy stdout', () => {
    const payload = {
      club: { name: 'AFP', description: 'Club', logo: '' },
      url: 'https://example.test',
      scrapedAt: '2026-08-20T12:00:00.000Z',
      matches: { '23/08/2026': [] },
    };
    const stdout = `Démarrage\n${SCRAPER_RESULT_PREFIX}${JSON.stringify(payload)}\nTerminé\n`;

    expect(parseScraperOutput(stdout)).toEqual(payload);
  });

  it('rejects a process output without a structured result', () => {
    expect(() => parseScraperOutput('Scraping terminé')).toThrow('résultat structuré');
  });
});
