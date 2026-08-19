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
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const db = await getDb();
    const user = await db.getRepository<UserEntity>('User').findOneBy({ email });
    let resetUrl: string | null = null;
    let deliveryConfigured = Boolean(
      process.env.PASSWORD_RESET_WEBHOOK_URL?.trim()
      || process.env.NOTIFICATION_EMAIL_WEBHOOK_URL?.trim(),
    );

    if (user?.active) {
      const repo = db.getRepository<PasswordResetTokenEntity>('PasswordResetToken');
      const latest = await repo.findOne({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
      const canIssue = !latest || Date.now() - new Date(latest.createdAt).getTime() >= 5 * 60_000;
      if (canIssue) {
        const rawToken = randomBytes(32).toString('hex');
        await repo.save({
          tokenHash: hashToken(rawToken),
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 60_000),
          usedAt: null,
        });
        const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '') || new URL(request.url).origin;
        resetUrl = `${baseUrl}/reinitialiser/${rawToken}`;
        if (deliveryConfigured) {
          deliveryConfigured = await deliverResetLink(user.email, resetUrl);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Si ce compte existe, les instructions de réinitialisation ont été préparées.',
      deliveryConfigured,
      ...(process.env.NODE_ENV !== 'production' && resetUrl && !deliveryConfigured ? { resetUrl } : {}),
    });
  } catch (error) {
    console.error('Password reset request failed:', error);
    return NextResponse.json({ error: 'Impossible de préparer la réinitialisation' }, { status: 500 });
  }
}
