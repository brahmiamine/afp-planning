import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PasswordResetTokenEntity, UserEntity } from '@/lib/db/schemas';
import { hashPassword } from '@/lib/auth/password';
import { revokeAllSessionsForUser } from '@/lib/auth/session';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return NextResponse.json({ error: 'Lien de réinitialisation invalide' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
    }

    const db = await getDb();
    const resetRepo = db.getRepository<PasswordResetTokenEntity>('PasswordResetToken');
    const reset = await resetRepo.findOneBy({ tokenHash: hashToken(token) });
    if (!reset || reset.usedAt || new Date(reset.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Ce lien est invalide ou expiré' }, { status: 410 });
    }

    const userRepo = db.getRepository<UserEntity>('User');
    const user = await userRepo.findOneBy({ id: reset.userId });
    if (!user || !user.active) {
      return NextResponse.json({ error: 'Compte indisponible' }, { status: 404 });
    }

    user.passwordHash = await hashPassword(newPassword);
    await userRepo.save(user);
    reset.usedAt = new Date();
    await resetRepo.save(reset);
    await revokeAllSessionsForUser(user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Password reset confirmation failed:', error);
    return NextResponse.json({ error: 'Impossible de réinitialiser le mot de passe' }, { status: 500 });
  }
}
