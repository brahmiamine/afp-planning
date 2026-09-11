import type { Metadata } from 'next';
import { buildPwaMetadata, resolveSessionPwaBranding } from '@/lib/pwa/branding';

export async function generateMetadata(): Promise<Metadata> {
  return buildPwaMetadata(await resolveSessionPwaBranding());
}

export default function MonPlanningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
