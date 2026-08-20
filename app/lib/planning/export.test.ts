import { describe, expect, it } from 'vitest';
import { csvCell } from './export';

describe('planning CSV export', () => {
  it('neutralizes cells that spreadsheet applications could execute as formulas', () => {
    expect(csvCell('=HYPERLINK("https://evil.example")')).toBe('"\'=HYPERLINK(""https://evil.example"")"');
    expect(csvCell('+1+1')).toBe('"\'+1+1"');
    expect(csvCell('-2+3')).toBe('"\'-2+3"');
    expect(csvCell('@SUM(A1:A2)')).toBe('"\'@SUM(A1:A2)"');
  });

  it('keeps ordinary text unchanged apart from RFC-style CSV quoting', () => {
    expect(csvCell('AFP, Paris')).toBe('"AFP, Paris"');
  });
});
