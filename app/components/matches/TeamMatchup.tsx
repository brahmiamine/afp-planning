'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { TeamLogo } from '@/components/ui/team-logo';

interface TeamMatchupProps {
  localTeam?: string | null;
  awayTeam?: string | null;
  localTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  /** Séparateur entre les deux équipes. */
  separator?: string;
  /** Taille des logos en pixels. */
  logoSize?: number;
  /** Repli quand les noms d'équipes ne sont pas disponibles (ex. entraînement/plateau). */
  fallbackTitle?: string;
  className?: string;
  nameClassName?: string;
}

/**
 * Affiche « logo + nom  vs  nom + logo » pour une rencontre. À utiliser partout où l'on
 * montre le nom d'un club afin d'y accoler systématiquement son logo.
 */
export const TeamMatchup = memo(function TeamMatchup({
  localTeam,
  awayTeam,
  localTeamLogo,
  awayTeamLogo,
  separator = 'vs',
  logoSize = 20,
  fallbackTitle,
  className,
  nameClassName,
}: TeamMatchupProps) {
  if (!localTeam && !awayTeam) {
    return <>{fallbackTitle ?? ''}</>;
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <TeamLogo logo={localTeamLogo ?? undefined} name={localTeam ?? ''} size={logoSize} className="shrink-0" />
      <span className={cn('font-medium', nameClassName)}>{localTeam || 'Équipe locale'}</span>
      <span className="text-muted-foreground">{separator}</span>
      <span className={cn('font-medium', nameClassName)}>{awayTeam || 'Équipe visiteuse'}</span>
      <TeamLogo logo={awayTeamLogo ?? undefined} name={awayTeam ?? ''} size={logoSize} className="shrink-0" />
    </span>
  );
});
