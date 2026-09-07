import type { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureAdminBootstrap } from './user-bootstrap';

const passwordMocks = vi.hoisted(() => ({
  hashPassword: vi.fn(async () => 'hashed-bootstrap-password'),
}));

vi.mock('@/lib/auth/password', () => ({
  hashPassword: passwordMocks.hashPassword,
}));

const savedEnv = {
  email: process.env.BOOTSTRAP_SUPERADMIN_EMAIL,
  password: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD,
  legacyEmail: process.env.BOOTSTRAP_ADMIN_EMAIL,
  legacyPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD,
};

afterEach(() => {
  if (savedEnv.email === undefined) delete process.env.BOOTSTRAP_SUPERADMIN_EMAIL;
  else process.env.BOOTSTRAP_SUPERADMIN_EMAIL = savedEnv.email;
  if (savedEnv.password === undefined) delete process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
  else process.env.BOOTSTRAP_SUPERADMIN_PASSWORD = savedEnv.password;
  if (savedEnv.legacyEmail === undefined) delete process.env.BOOTSTRAP_ADMIN_EMAIL;
  else process.env.BOOTSTRAP_ADMIN_EMAIL = savedEnv.legacyEmail;
  if (savedEnv.legacyPassword === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  else process.env.BOOTSTRAP_ADMIN_PASSWORD = savedEnv.legacyPassword;
  vi.restoreAllMocks();
});

describe('ensureAdminBootstrap', () => {
  it('creates the first admin with the documented BOOTSTRAP_SUPERADMIN_* variables', async () => {
    process.env.BOOTSTRAP_SUPERADMIN_EMAIL = ' Admin@Example.FR ';
    process.env.BOOTSTRAP_SUPERADMIN_PASSWORD = 'bootstrap-secret';
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

    const repo = {
      count: vi.fn(async () => 0),
      findOneBy: vi.fn(async () => null),
      save: vi.fn(async (value: unknown) => value),
    };
    const db = {
      getRepository: vi.fn(() => repo),
    } as unknown as DataSource;

    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await ensureAdminBootstrap(db);

    expect(repo.findOneBy).toHaveBeenCalledWith({ email: 'admin@example.fr' });
    expect(passwordMocks.hashPassword).toHaveBeenCalledWith('bootstrap-secret');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      email: 'admin@example.fr',
      passwordHash: 'hashed-bootstrap-password',
      roles: ['admin'],
      active: true,
    }));
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('BOOTSTRAP_SUPERADMIN_EMAIL'));
  });
});
