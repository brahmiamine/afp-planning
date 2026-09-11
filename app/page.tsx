import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import { LandingPage } from '@/components/landing/LandingPage';
import { buildPwaMetadata, resolveAppProductBranding } from '@/lib/pwa/branding';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

const appBranding = resolveAppProductBranding();

export const metadata: Metadata = {
  ...buildPwaMetadata(appBranding),
  description:
    "Clubika réunit matchs, entraînements, plateaux, affectations des arbitres et encadrants, disponibilités, chat temps réel et notifications dans une seule application pour les clubs de football amateurs.",
};

export default function Home() {
  return (
    <div className={archivo.variable}>
      <LandingPage />
    </div>
  );
}
