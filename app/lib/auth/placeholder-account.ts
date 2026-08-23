import type { DataSource } from 'typeorm';
import type { UserEntity } from '@/lib/db/schemas';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'personne';
}

export async function generatePlaceholderEmail(db: DataSource, nom: string, tag: string): Promise<string> {
  const userRepo = db.getRepository<UserEntity>('User');
  const base = `${slugify(nom)}.${tag}`;
  let email = `${base}@sans-acces.local`;
  let suffix = 1;
  while (await userRepo.findOneBy({ email })) {
    suffix += 1;
    email = `${base}${suffix}@sans-acces.local`;
  }
  return email;
}
