import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScraperButton } from './ScraperButton';

describe('ScraperButton (issue #318)', () => {
  it('applique la même taille visuelle que Export, y compris pendant Actualisation', () => {
    const html = renderToStaticMarkup(<ScraperButton onScrapeComplete={() => {}} />);

    expect(html).toContain('w-full');
    expect(html).toContain('sm:w-[11rem]');
    expect(html).toContain('h-8');
    expect(html).toContain('Actualiser');
    expect(html).not.toContain('Actualisation...');
  });
});
