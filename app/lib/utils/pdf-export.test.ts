import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/types/match';

const jsPdfState = vi.hoisted(() => ({
  fills: [] as number[][],
  draws: [] as number[][],
  texts: [] as Array<{ color: number[]; value: string }>,
  textColor: [0, 0, 0] as number[],
  images: [] as Array<{ format: string; w: number; h: number }>,
}));

vi.mock('jspdf', () => {
  class FakeJsPDF {
    internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };
    setFillColor(...args: number[]) {
      jsPdfState.fills.push(args);
    }
    setDrawColor(...args: number[]) {
      jsPdfState.draws.push(args);
    }
    setTextColor(...args: number[]) {
      jsPdfState.textColor = args;
    }
    setLineWidth() {}
    setFontSize() {}
    setFont() {}
    getTextWidth() {
      return 24;
    }
    text(value: string) {
      jsPdfState.texts.push({ color: [...jsPdfState.textColor], value });
    }
    rect() {}
    line() {}
    addImage(_data: string, format: string, _x: number, _y: number, w: number, h: number) {
      jsPdfState.images.push({ format, w, h });
    }
    roundedRect() {}
    addPage() {}
    splitTextToSize(text: string) {
      return [text];
    }
    save() {}
  }
  return { default: FakeJsPDF };
});

import {
  detectPdfImageFormat,
  fitContain,
  generatePdf,
  hexToRgb,
  prepareClubLogoForPdf,
  proxiedPdfLogoSrc,
  resolvePdfPalette,
} from './pdf-export';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function sampleMatch(): Match {
  return {
    id: 'm-1',
    type: 'officiel',
    date: '23/08/2099',
    time: '15:00',
    horaireRendezVous: '14:00',
    competition: 'Championnat',
    localTeam: 'AFP',
    awayTeam: 'Visiteur',
    venue: 'domicile',
  };
}

describe('hexToRgb', () => {
  it('convertit #rrggbb et #rgb', () => {
    expect(hexToRgb('#1a2b3c', [0, 0, 0])).toEqual([26, 43, 60]);
    expect(hexToRgb('#abc', [0, 0, 0])).toEqual([170, 187, 204]);
  });

  it('retombe sur le fallback si la couleur est absente ou invalide', () => {
    expect(hexToRgb(undefined, [1, 2, 3])).toEqual([1, 2, 3]);
    expect(hexToRgb('not-a-color', [9, 9, 9])).toEqual([9, 9, 9]);
    expect(hexToRgb('#gg0000', [4, 5, 6])).toEqual([4, 5, 6]);
  });
});

describe('resolvePdfPalette', () => {
  it('produit des palettes distinctes pour deux clubs', () => {
    const navy = resolvePdfPalette({ primaryColor: '#0b3d91', secondaryColor: '#f4c430' });
    const green = resolvePdfPalette({ primaryColor: '#0f5132', secondaryColor: '#d1e7dd' });

    expect(navy.primary).toEqual([11, 61, 145]);
    expect(green.primary).toEqual([15, 81, 50]);
    expect(navy.primary).not.toEqual(green.primary);
    expect(navy.secondary).not.toEqual(green.secondary);
    expect(navy.altRow).not.toEqual(green.altRow);
  });

  it('conserve un rendu lisible sans branding personnalisé', () => {
    const palette = resolvePdfPalette();
    expect(palette.primary).toEqual([0, 50, 135]);
    expect(palette.secondary).toEqual([227, 235, 247]);
    expect(palette.headerText[0]).toBeGreaterThan(200);
  });
});

describe('generatePdf branding (issue #316)', () => {
  beforeEach(() => {
    jsPdfState.fills = [];
    jsPdfState.draws = [];
    jsPdfState.texts = [];
    jsPdfState.textColor = [0, 0, 0];
    jsPdfState.images = [];
  });

  it('applique les couleurs primaire et secondaire du club', async () => {
    const branding = { primaryColor: '#0b3d91', secondaryColor: '#f4c430' };
    const palette = resolvePdfPalette(branding);

    await generatePdf(
      [sampleMatch()],
      [],
      {},
      { name: 'AFP', description: '', logo: '' },
      'AFP',
      branding,
    );

    expect(jsPdfState.fills).toContainEqual(palette.headerBand);
    expect(jsPdfState.fills).toContainEqual(palette.primary);
    expect(jsPdfState.fills).toContainEqual(palette.altRow);
    expect(jsPdfState.draws).toContainEqual(palette.primary);
    expect(jsPdfState.texts.some((entry) => entry.value === 'AFP' && entry.color[0] === palette.primary[0])).toBe(true);
  });

  it('dessine le logo du club sans le forcer en PNG carré déformé', async () => {
    await generatePdf(
      [sampleMatch()],
      [],
      {},
      { name: 'Salesienne', description: '', logo: TINY_PNG },
    );

    expect(jsPdfState.images).toEqual([{ format: 'PNG', w: 13.6, h: 13.6 }]);
    expect(jsPdfState.fills).toContainEqual([255, 255, 255]);
  });
});

describe('préparation du logo PDF', () => {
  it('détecte le format et conserve les proportions', () => {
    expect(detectPdfImageFormat(TINY_PNG)).toBe('PNG');
    expect(detectPdfImageFormat('data:image/jpeg;base64,xx')).toBe('JPEG');
    expect(fitContain(200, 100, 16, 16)).toEqual({ w: 16, h: 8, x: 0, y: 4 });
  });

  it('passe les logos distants par le proxy même-origine', () => {
    expect(proxiedPdfLogoSrc('https://cdn.example/blason.jpg')).toMatch(/^\/api\/logo-proxy\?url=/);
    expect(proxiedPdfLogoSrc(TINY_PNG)).toBe(TINY_PNG);
  });

  it('accepte un data URL PNG même hors navigateur', async () => {
    await expect(prepareClubLogoForPdf(TINY_PNG)).resolves.toBe(TINY_PNG);
  });
});
