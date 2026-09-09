import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/auth/platform-require';
import { isEncryptionConfigured } from '@/lib/crypto/secret-box';

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth(request);
  if ('error' in auth) return auth.error;

  return NextResponse.json({
    admin: {
      id: auth.admin.id,
      email: auth.admin.email,
      nom: auth.admin.nom,
    },
    // Visible dans l'interface plateforme tant que APP_ENCRYPTION_KEY n'est pas définie
    // (issue #212) : la dégradation en clair ne doit plus être silencieuse.
    encryptionConfigured: isEncryptionConfigured(),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  });
}
