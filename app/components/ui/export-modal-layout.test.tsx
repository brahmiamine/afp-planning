import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPORT_MODAL_BODY_CLASS,
  EXPORT_MODAL_CONTENT_CLASS,
  EXPORT_MODAL_FIELDS_CLASS,
  EXPORT_MODAL_GRID_CLASS,
} from './export-modal-layout';

describe('export modal layout (issue #317)', () => {
  it('n’empile pas deux overflow-y-auto et reste une colonne sur mobile', () => {
    expect(EXPORT_MODAL_CONTENT_CLASS).toContain('overflow-hidden');
    expect(EXPORT_MODAL_CONTENT_CLASS).not.toContain('overflow-y-auto');
    expect(EXPORT_MODAL_BODY_CLASS).toContain('overflow-y-auto');
    expect(EXPORT_MODAL_FIELDS_CLASS).not.toContain('overflow-y-auto');
    expect(EXPORT_MODAL_FIELDS_CLASS).not.toContain('max-h-64');
    expect(EXPORT_MODAL_GRID_CLASS).toContain('grid-cols-1');
    expect(EXPORT_MODAL_GRID_CLASS).toContain('sm:grid-cols-2');
  });

  it('applique exactement la même structure aux modales PDF et CSV', () => {
    const pdf = readFileSync(new URL('./export-pdf-modal.tsx', import.meta.url), 'utf8');
    const csv = readFileSync(new URL('./export-csv-modal.tsx', import.meta.url), 'utf8');

    for (const source of [pdf, csv]) {
      expect(source).toContain('EXPORT_MODAL_CONTENT_CLASS');
      expect(source).toContain('EXPORT_MODAL_BODY_CLASS');
      expect(source).toContain('EXPORT_MODAL_FIELDS_CLASS');
      expect(source).toContain('EXPORT_MODAL_GRID_CLASS');
      expect(source).toContain('EXPORT_MODAL_OPTION_CLASS');
      expect(source).toContain('Annuler');
      expect(source).not.toContain('max-h-64');
      expect(source).not.toContain('overflow-y-auto');
    }
  });
});
