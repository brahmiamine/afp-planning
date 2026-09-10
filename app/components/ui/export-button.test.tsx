import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ExportButton } from './export-button';

vi.mock('./export-pdf-modal', () => ({ ExportPdfModal: () => null }));
vi.mock('./export-csv-modal', () => ({ ExportCsvModal: () => null }));
vi.mock('./export-ical-modal', () => ({ ExportIcalModal: () => null }));

describe('ExportButton (issue #318)', () => {
  it('applique la même taille visuelle que Actualiser', () => {
    const html = renderToStaticMarkup(<ExportButton />);

    expect(html).toContain('min-w-[9.75rem]');
    expect(html).toContain('h-8');
    expect(html).toContain('Export');
  });
});
