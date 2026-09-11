import type { Metadata } from 'next';
import { buildPwaMetadata, resolveAppProductBranding } from '@/lib/pwa/branding';

const appBranding = resolveAppProductBranding();

export const metadata: Metadata = buildPwaMetadata(appBranding);

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
