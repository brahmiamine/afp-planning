import { describe, expect, it } from 'vitest';
import {
  BodyValidator,
  RequestValidationError,
  isValidEventDate,
  isValidEventTime,
  parseJsonBody,
} from './request';

describe('parseJsonBody', () => {
  it('accepts a plain object', () => {
    expect(parseJsonBody({ a: 1 })).toEqual({ a: 1 });
  });

  it.each([null, undefined, 'string', 42, ['a', 'b'], true])('rejects %p as a request body', (value) => {
    expect(() => parseJsonBody(value)).toThrow(RequestValidationError);
  });
});

describe('isValidEventDate', () => {
  it.each(['20/09/2026', '01/01/2000', '29/02/2024'])('accepts %p', (value) => {
    expect(isValidEventDate(value)).toBe(true);
  });

  it.each([
    '2026-09-20',
    '20-09-2026',
    '32/01/2026',
    '00/01/2026',
    '31/02/2026',
    '29/02/2026',
    '20/13/2026',
    '20/00/2026',
    '',
    undefined,
    null,
    42,
  ])('rejects %p', (value) => {
    expect(isValidEventDate(value)).toBe(false);
  });
});

describe('isValidEventTime', () => {
  it.each(['00:00', '23:59', '09:05'])('accepts %p', (value) => {
    expect(isValidEventTime(value)).toBe(true);
  });

  it.each(['24:00', '10:60', '9:05', '10:5', 'abc', '', undefined, null, 10])('rejects %p', (value) => {
    expect(isValidEventTime(value)).toBe(false);
  });
});

describe('BodyValidator.forbidUnknownFields', () => {
  it('rejette les champs non listés', () => {
    const v = new BodyValidator({ clubId: 'afp', revision: 2, lieu: 'Terrain' });
    v.forbidUnknownFields(['lieu']);
    expect(() => v.throwIfInvalid()).toThrow(RequestValidationError);
    expect(v.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['clubId', 'revision']));
  });
});
describe('BodyValidator.string', () => {
  it('accepts and trims a valid string', () => {
    const v = new BodyValidator({ lieu: '  Terrain A  ' });
    expect(v.string('lieu')).toBe('Terrain A');
    expect(v.issues).toHaveLength(0);
  });

  it('fails when a required string is missing', () => {
    const v = new BodyValidator({});
    expect(v.string('lieu')).toBeUndefined();
    expect(v.issues).toEqual([{ field: 'lieu', message: 'requis' }]);
  });

  it('does not fail when an optional string is missing', () => {
    const v = new BodyValidator({});
    expect(v.string('categorie', { required: false })).toBeUndefined();
    expect(v.issues).toHaveLength(0);
  });

  it('fails when the value is not a string', () => {
    const v = new BodyValidator({ lieu: 42 });
    v.string('lieu');
    expect(v.issues).toEqual([{ field: 'lieu', message: 'doit être une chaîne de caractères' }]);
  });

  it('fails when a whitespace-only string is provided for a required field', () => {
    const v = new BodyValidator({ lieu: '   ' });
    v.string('lieu');
    expect(v.issues).toEqual([{ field: 'lieu', message: 'requis' }]);
  });

  it('fails when the string exceeds maxLength', () => {
    const v = new BodyValidator({ categorie: 'a'.repeat(65) });
    v.string('categorie', { maxLength: 64 });
    expect(v.issues).toEqual([{ field: 'categorie', message: 'ne doit pas dépasser 64 caractères' }]);
  });
});

describe('BodyValidator.date / time', () => {
  it('rejects a missing required date with an actionable message', () => {
    const v = new BodyValidator({});
    v.date('date');
    expect(v.issues).toEqual([{ field: 'date', message: 'requis (format jj/mm/aaaa)' }]);
  });

  it('rejects a structurally-formed but impossible calendar date', () => {
    const v = new BodyValidator({ date: '31/02/2026' });
    v.date('date');
    expect(v.issues).toEqual([{ field: 'date', message: 'doit être une date valide au format jj/mm/aaaa' }]);
  });

  it('accepts a valid date and returns it unchanged', () => {
    const v = new BodyValidator({ date: '20/09/2026' });
    expect(v.date('date')).toBe('20/09/2026');
  });

  it('rejects a malformed time', () => {
    const v = new BodyValidator({ time: '25:99' });
    v.time('time');
    expect(v.issues).toEqual([{ field: 'time', message: 'doit être une heure valide au format hh:mm' }]);
  });

  it('lets an optional date/time be entirely absent', () => {
    const v = new BodyValidator({});
    expect(v.date('date', { required: false })).toBeUndefined();
    expect(v.time('time', { required: false })).toBeUndefined();
    expect(v.issues).toHaveLength(0);
  });
});

describe('BodyValidator.enum', () => {
  it('accepts an allowed value', () => {
    const v = new BodyValidator({ venue: 'domicile' });
    expect(v.enum('venue', ['domicile', 'extérieur'] as const)).toBe('domicile');
  });

  it('rejects a value outside the allowed set', () => {
    const v = new BodyValidator({ venue: 'ailleurs' });
    v.enum('venue', ['domicile', 'extérieur'] as const);
    expect(v.issues).toEqual([{ field: 'venue', message: 'doit être l\'une des valeurs suivantes : domicile, extérieur' }]);
  });
});

describe('BodyValidator.number', () => {
  it('accepts a number within bounds', () => {
    const v = new BodyValidator({ durationMinutes: 90 });
    expect(v.number('durationMinutes', { min: 1, max: 1440 })).toBe(90);
  });

  it('rejects a non-number', () => {
    const v = new BodyValidator({ durationMinutes: '90' });
    v.number('durationMinutes');
    expect(v.issues).toEqual([{ field: 'durationMinutes', message: 'doit être un nombre' }]);
  });

  it('rejects NaN / Infinity', () => {
    const v = new BodyValidator({ durationMinutes: Infinity });
    v.number('durationMinutes');
    expect(v.issues).toEqual([{ field: 'durationMinutes', message: 'doit être un nombre' }]);
  });

  it('rejects a value outside bounds', () => {
    const v = new BodyValidator({ durationMinutes: 0 });
    v.number('durationMinutes', { min: 1, max: 1440 });
    expect(v.issues).toEqual([{ field: 'durationMinutes', message: 'doit être supérieur ou égal à 1' }]);
  });

  it('is optional by default', () => {
    const v = new BodyValidator({});
    expect(v.number('durationMinutes')).toBeUndefined();
    expect(v.issues).toHaveLength(0);
  });
});

describe('BodyValidator.boolean', () => {
  it('accepts true/false', () => {
    const v = new BodyValidator({ confirmed: false });
    expect(v.boolean('confirmed')).toBe(false);
    expect(v.issues).toHaveLength(0);
  });

  it('rejects a non-boolean', () => {
    const v = new BodyValidator({ confirmed: 'yes' });
    v.boolean('confirmed');
    expect(v.issues).toEqual([{ field: 'confirmed', message: 'doit être un booléen' }]);
  });
});

describe('BodyValidator.stringArray', () => {
  it('accepts an array of non-empty strings', () => {
    const v = new BodyValidator({ categories: ['U11', 'U13'] });
    expect(v.stringArray('categories')).toEqual(['U11', 'U13']);
    expect(v.issues).toHaveLength(0);
  });

  it('rejects a non-array', () => {
    const v = new BodyValidator({ categories: 'U11' });
    v.stringArray('categories');
    expect(v.issues).toEqual([{ field: 'categories', message: 'doit être une liste' }]);
  });

  it('flags each non-string / empty entry individually', () => {
    const v = new BodyValidator({ categories: ['U11', '', 42] });
    v.stringArray('categories');
    expect(v.issues).toEqual([
      { field: 'categories[1]', message: 'doit être une chaîne de caractères non vide' },
      { field: 'categories[2]', message: 'doit être une chaîne de caractères non vide' },
    ]);
  });
});

describe('BodyValidator.assignmentContacts', () => {
  it('accepts a well-formed contact list, including an empty one', () => {
    const v = new BodyValidator({ encadrants: [{ nom: 'Jean', numero: '' }] });
    expect(v.assignmentContacts('encadrants')).toEqual([{ nom: 'Jean', numero: '' }]);
    expect(v.issues).toHaveLength(0);

    const empty = new BodyValidator({ encadrants: [] });
    expect(empty.assignmentContacts('encadrants')).toEqual([]);
    expect(empty.issues).toHaveLength(0);
  });

  it('rejects a non-array', () => {
    const v = new BodyValidator({ encadrants: { nom: 'Jean' } });
    v.assignmentContacts('encadrants');
    expect(v.issues).toEqual([{ field: 'encadrants', message: 'doit être une liste' }]);
  });

  it('flags each contact missing a name, by index', () => {
    const v = new BodyValidator({ encadrants: [{ nom: 'Jean' }, { numero: '0600000000' }, 'not-an-object'] });
    v.assignmentContacts('encadrants');
    expect(v.issues).toEqual([
      { field: 'encadrants[1].nom', message: 'requis' },
      { field: 'encadrants[2].nom', message: 'requis' },
    ]);
  });

  it('is absent (not required) by default', () => {
    const v = new BodyValidator({});
    expect(v.assignmentContacts('encadrants')).toBeUndefined();
    expect(v.issues).toHaveLength(0);
  });
});

describe('BodyValidator.throwIfInvalid', () => {
  it('collects every issue across fields before throwing once', () => {
    const v = new BodyValidator({ durationMinutes: 'ninety' });
    v.date('date');
    v.time('time');
    v.string('lieu');
    v.number('durationMinutes');

    expect(() => v.throwIfInvalid()).toThrow(RequestValidationError);
    try {
      v.throwIfInvalid();
      throw new Error('expected throwIfInvalid to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationError);
      const issues = (error as RequestValidationError).issues;
      expect(issues.map((issue) => issue.field).sort()).toEqual(['date', 'durationMinutes', 'lieu', 'time']);
    }
  });

  it('does not throw when every field is valid', () => {
    const v = new BodyValidator({ date: '20/09/2026', time: '10:00', lieu: 'Terrain' });
    v.date('date');
    v.time('time');
    v.string('lieu');
    expect(() => v.throwIfInvalid()).not.toThrow();
  });
});
