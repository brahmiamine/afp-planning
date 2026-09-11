import Image from 'next/image';
import type { ReactNode } from 'react';

import { Card } from '@/app/components/ui/card';

/**
 * Enveloppe commune des écrans hors session : connexion, mot de passe oublié,
 * réinitialisation, inscription par lien.
 *
 * Ces écrans ne sont PAS rattachés à un club : `/login` est l'entrée unique de
 * toute la plateforme et redirige vers `/club` ou `/mon-planning` selon le
 * compte (email + rôle). On affiche donc l'identité produit « Clubika »
 * (logo + palette FFF), jamais le nom/logo d'un club particulier.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[480px_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full border-[32px] border-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full border border-white/10"
        />
        <div className="relative flex items-center gap-2.5">
          <Image src="/branding/clubika-icon.png" alt="" width={40} height={40} className="h-9 w-9" priority />
          <span className="text-xl font-extrabold tracking-tight">Clubika</span>
        </div>
        <div className="relative flex flex-col gap-4">
          <span className="inline-flex w-fit items-center rounded-full bg-[color:var(--gold)]/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--gold)]">
            Accès club
          </span>
          <h1 className="max-w-[16ch] text-3xl font-extrabold leading-tight tracking-tight">
            Le planning de votre club, enfin sous contrôle.
          </h1>
          <p className="max-w-[34ch] text-sm leading-6 text-primary-foreground/70">
            Matchs, affectations, disponibilités, chat et notifications réunis dans un seul espace pour tout le club.
          </p>
        </div>
        <p className="relative text-xs text-primary-foreground/50">© {new Date().getFullYear()} Clubika</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 bg-secondary-soft p-4">
        <div className="flex items-center gap-2 lg:hidden">
          <Image src="/branding/clubika-icon.png" alt="" width={36} height={36} className="h-8 w-8" />
          <span className="text-lg font-extrabold tracking-tight text-foreground">Clubika</span>
        </div>
        <Card className="w-full max-w-md">{children}</Card>
      </div>
    </div>
  );
}
