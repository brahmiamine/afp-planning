import type { Metadata } from 'next';
import { buildPublicShareMetadata } from '@/lib/planning/public-share-branding';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return buildPublicShareMetadata(token);
}

export default function PublicShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
