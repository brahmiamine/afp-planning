'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import { apiGet } from '@/lib/utils/api';
import { cn } from '@/lib/utils';
import { calculateDetailedMatchStats } from '@/lib/utils/match';
import type { DashboardData } from '@/hooks/useDashboardData';
import type { Match } from '@/types/match';

interface WeekendData {
  start: string;
  end: string;
  total: number;
  ready: number;
  attention: number;
}

interface DashboardSummaryProps {
  dashboard: DashboardData | null;
  matches?: Record<string, Match[]>;
  /** Incrémenter pour forcer un rechargement du pilotage du week-end. */
  refreshKey?: number;
}

type Tone = 'default' | 'ok' | 'warn';

const toneClass: Record<Tone, string> = {
  default: 'text-foreground',
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-destructive',
};

function formatWeekendDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }).format(parsed);
}

function Tile({
  label,
  value,
  sub,
  tone = 'default',
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <CardContent className="p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-xl font-bold leading-tight', toneClass[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </CardContent>
  );
  if (href) {
    return (
      <Card className="transition-colors hover:border-primary/40 hover:bg-muted/40">
        <Link href={href} className="block">{body}</Link>
      </Card>
    );
  }
  return <Card>{body}</Card>;
}

/**
 * Bandeau compact d'indicateurs du tableau de bord : pilotage du week-end, volume de matchs
 * et signaux opérationnels (attente, refus, rôles manquants…) réunis en une seule grille
 * plutôt qu'en plusieurs blocs de grandes cartes.
 */
export function DashboardSummary({ dashboard, matches, refreshKey = 0 }: DashboardSummaryProps) {
  const [weekend, setWeekend] = useState<WeekendData | null>(null);

  const load = useCallback(async () => {
    try {
      setWeekend(await apiGet<WeekendData>('/api/planning/weekend'));
    } catch {
      setWeekend(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const matchStats = useMemo(
    () => (matches ? calculateDetailedMatchStats(matches) : null),
    [matches],
  );

  const totals = dashboard?.totals;
  const weekendTotal = weekend?.total ?? dashboard?.weekend.total ?? 0;
  const weekendReady = weekend?.ready ?? dashboard?.weekend.ready ?? 0;
  const weekendAttention = weekend?.attention ?? dashboard?.weekend.attention ?? 0;

  const secondary: Array<{ label: string; variant: 'outline' | 'destructive' }> = [];
  // Les rôles manquants se pilotent depuis la préparation du planning (/club/planning) :
  // on ne les affiche plus comme signal sur le tableau de bord (issue #135).
  if (totals?.replacements) secondary.push({ label: `${totals.replacements} remplacement(s)`, variant: 'destructive' });
  if (totals?.remindersDue) secondary.push({ label: `${totals.remindersDue} relance(s) due(s)`, variant: 'outline' });
  if (totals?.attendancePending) secondary.push({ label: `${totals.attendancePending} présence(s) à saisir`, variant: 'outline' });

  return (
    <section id="week-end" className="scroll-mt-24 space-y-3" aria-labelledby="dashboard-summary-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="dashboard-summary-heading" className="text-lg font-bold sm:text-xl">Vue d’ensemble</h2>
        </div>
        {weekend && (
          <Badge variant="outline" className="w-fit">
            Week-end {formatWeekendDate(weekend.start)} → {formatWeekendDate(weekend.end)}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Ce week-end" value={weekendTotal} sub="événements" />
        <Tile label="Prêts" value={weekendReady} tone={weekendReady > 0 ? 'ok' : 'default'} />
        <Tile
          label="À traiter"
          value={weekendAttention}
          tone={weekendAttention > 0 ? 'warn' : 'default'}
          href="/club/planning"
        />
        <Tile
          label="Matchs"
          value={matchStats?.totalMatches ?? totals?.events ?? 0}
          sub={matchStats ? `${matchStats.homeMatches} dom · ${matchStats.awayMatches} ext` : undefined}
        />
        <Tile
          label="En attente"
          value={totals?.pending ?? 0}
          href="/club/planning"
        />
        <Tile
          label="Refus"
          value={totals?.declined ?? 0}
          tone={(totals?.declined ?? 0) > 0 ? 'warn' : 'default'}
          href="/club/planning"
        />
      </div>

      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {secondary.map((item) => (
            <Badge key={item.label} variant={item.variant} className="font-normal">{item.label}</Badge>
          ))}
        </div>
      )}
    </section>
  );
}
