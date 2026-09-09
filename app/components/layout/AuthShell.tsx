import { CalendarDays } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/app/components/ui/card';

/**
 * Enveloppe commune des écrans hors session : connexion, mot de passe oublié,
 * réinitialisation, inscription par lien.
 *
 * Ces écrans ne sont PAS rattachés à un club : `/login` est l'entrée unique de
 * toute la plateforme et redirige vers `/club` ou `/mon-planning` selon le
 * compte (email + rôle). On affiche donc l'identité produit « PlanningClub »,
 * jamais le nom/logo d'un club particulier ; seules les couleurs (tokens de
 * thème) portent l'habillage visuel commun.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-secondary-soft p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <CalendarDays className="h-8 w-8" />
        </span>
        <p className="text-lg font-bold tracking-tight text-foreground">PlanningClub</p>
      </div>
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}
