import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PasswordResetTokenEntity, UserEntity } from '@/lib/db/schemas';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function deliverResetLink(email: string, resetUrl: string): Promise<boolean> {
  const url = process.env.PASSWORD_RESET_WEBHOOK_URL?.trim()
    || process.env.NOTIFICATION_EMAIL_WEBHOOK_URL?.trim();
  if (!url) return false;

  const token = process.env.PASSWORD_RESET_WEBHOOK_TOKEN?.trim()
    || process.env.NOTIFICATION_EMAIL_WEBHOOK_TOKEN?.trim();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        to: email,
        subject: 'Réinitialisation de votre mot de passe AFP Planning',
        text: `Utilisez ce lien pour choisir un nouveau mot de passe : ${resetUrl}`,
        resetUrl,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error('Password reset delivery failed:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const genericResponse = (resetUrl?: string | null) => NextResponse.json({
    success: true,
    message: 'Si ce compte existe, les instructions de réinitialisation ont été préparées.',
    ...(process.env.NODE_ENV !== 'production' && resetUrl ? { resetUrl } : {}),
  });

  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const db = await getDb();
    const user = await db.getRepository<UserEntity>('User').findOneBy({ email });
    if (!user?.active) return genericResponse();

    const repo = db.getRepository<PasswordResetTokenEntity>('PasswordResetToken');
    const latest = await repo.findOne({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < 5 * 60_000) {
      return genericResponse();
    }

    const rawToken = randomBytes(32).toString('hex');
    await repo.save({
      tokenHash: hashToken(rawToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      usedAt: null,
    });

    const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '') || new URL(request.url).origin;
    const resetUrl = `${baseUrl}/reinitialiser/${rawToken}`;
    const delivered = await deliverResetLink(user.email, resetUrl);
    return genericResponse(delivered ? null : resetUrl);
  } catch (error) {
    console.error('Password reset request failed:', error);
    return genericResponse();
  }
}
