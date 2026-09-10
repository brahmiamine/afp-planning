import { describe, expect, it } from 'vitest';
import { TYPEORM_ENTITY_TABLE_NAMES, TYPEORM_ENTITY_TABLE_STATEMENTS } from './typeorm-entity-tables';

describe('TYPEORM_ENTITY_TABLE_STATEMENTS (issue #283)', () => {
  it('declares a CREATE TABLE for every TypeORM entity table', () => {
    expect(TYPEORM_ENTITY_TABLE_STATEMENTS).toHaveLength(TYPEORM_ENTITY_TABLE_NAMES.length);
    for (const table of TYPEORM_ENTITY_TABLE_NAMES) {
      expect(TYPEORM_ENTITY_TABLE_STATEMENTS.some((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true);
    }
  });
});
