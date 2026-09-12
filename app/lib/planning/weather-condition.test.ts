import { describe, expect, it } from 'vitest';
import { weatherConditionFromCode } from './weather-condition';

describe('weatherConditionFromCode', () => {
  it('délègue au mapper centralisé (jour par défaut)', () => {
    expect(weatherConditionFromCode(0)).toEqual({ kind: 'sun', label: 'Ciel dégagé' });
    expect(weatherConditionFromCode(0, false)).toEqual({ kind: 'moon', label: 'Ciel dégagé' });
    expect(weatherConditionFromCode(2).kind).toBe('cloud-sun');
    expect(weatherConditionFromCode(3).kind).toBe('cloud');
    expect(weatherConditionFromCode(45).kind).toBe('fog');
    expect(weatherConditionFromCode(61).kind).toBe('cloud-rain');
    expect(weatherConditionFromCode(80).kind).toBe('cloud-drizzle');
    expect(weatherConditionFromCode(75).kind).toBe('cloud-snow-heavy');
    expect(weatherConditionFromCode(95)).toEqual({ kind: 'cloud-lightning', label: 'Orage' });
    expect(weatherConditionFromCode(123).label).toBe('Conditions météo inconnues');
  });
});
