import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Primitives de mise en page partagées par tous les écrans `/club` et
 * `/mon-planning`. Elles fixent une grammaire visuelle unique (conteneur,
 * en-tête, carte de section, liste responsive, pastille de statut, carte KPI)
 * et s'appuient exclusivement sur les tokens de thème — dont `--primary` /
 * `--secondary` pilotés par la personnalisation du club — pour porter partout
 * l'identité couleur principale + secondaire.
 */

/* ------------------------------------------------------------------ */
/* Conteneur de page                                                   */
/* ------------------------------------------------------------------ */

export function PageContainer({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('space-y-6 sm:space-y-8', className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* En-tête de page                                                     */
/* ------------------------------------------------------------------ */

interface PageHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Boutons/actions ; passent sous le titre en dessous de `sm`. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary [&>svg]:h-5 [&>svg]:w-5">
            {icon}
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground text-pretty">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carte de section                                                    */
/* ------------------------------------------------------------------ */

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Retire le padding interne du contenu (utile pour une `DataList` pleine largeur). */
  flush?: boolean;
}

export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  className,
  contentClassName,
  flush = false,
}: SectionCardProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary-soft px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="shrink-0 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
            <div className="min-w-0 space-y-0.5">
              {title && <h2 className="text-base font-semibold leading-tight text-foreground">{title}</h2>}
              {description && <p className="text-xs text-muted-foreground text-pretty">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <CardContent className={cn(flush ? 'p-0' : 'p-4 sm:p-6', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Liste responsive — le remplaçant de `<table>`                       */
/* ------------------------------------------------------------------ */

interface DataListProps {
  /** Gabarit de colonnes appliqué à partir de `sm` (ex. `"1fr 1fr auto"`). */
  columns?: string;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  empty?: ReactNode;
  /** Si fourni et vide → rend `empty`. */
  isEmpty?: boolean;
}

export function DataList({ columns, header, children, className, empty, isEmpty }: DataListProps) {
  const style = columns ? ({ '--data-cols': columns } as CSSProperties) : undefined;
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)} style={style}>
      {header && (
        <div
          className="hidden gap-3 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid"
          style={columns ? { gridTemplateColumns: 'var(--data-cols)' } : undefined}
        >
          {header}
        </div>
      )}
      {isEmpty ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">{empty ?? 'Aucun élément'}</div>
      ) : (
        <div className="divide-y">{children}</div>
      )}
    </div>
  );
}

interface DataRowProps {
  children: ReactNode;
  columns?: string;
  className?: string;
  href?: string;
  onClick?: () => void;
}

export function DataRow({ children, columns, className, href, onClick }: DataRowProps) {
  const style = columns ? ({ '--data-cols': columns } as CSSProperties) : undefined;
  const base = cn(
    'grid grid-cols-1 gap-3 px-4 py-3.5 text-sm transition-colors sm:items-center sm:[grid-template-columns:var(--data-cols)]',
    (href || onClick) && 'hover:bg-secondary-soft focus-visible:bg-secondary-soft cursor-pointer outline-none',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={base} style={style}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'w-full text-left')} style={style}>
        {children}
      </button>
    );
  }
  return (
    <div className={base} style={style}>
      {children}
    </div>
  );
}

interface DataCellProps {
  /** Libellé affiché uniquement en vue mobile empilée. */
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'end';
}

export function DataCell({ label, children, className, align = 'start' }: DataCellProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 sm:block',
        align === 'end' && 'sm:text-right',
        className,
      )}
    >
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
          {label}
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pastille de statut — source unique des couleurs sémantiques         */
/* ------------------------------------------------------------------ */

export type StatusTone = 'success' | 'warning' | 'pending' | 'danger' | 'info' | 'neutral';

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-chart-2/15 text-chart-2 dark:bg-chart-2/20',
  warning: 'bg-chart-4/15 text-chart-4 dark:bg-chart-4/20',
  pending: 'bg-chart-4/15 text-chart-4 dark:bg-chart-4/20',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-primary-soft text-primary',
  neutral: 'bg-muted text-muted-foreground',
};

export function StatusPill({
  tone,
  className,
  ...props
}: ComponentProps<typeof Badge> & { tone: StatusTone }) {
  return (
    <Badge
      variant="secondary"
      className={cn('border-transparent', STATUS_TONE_CLASS[tone], className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Carte KPI                                                           */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, icon, hint, className }: StatCardProps) {
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border bg-card p-4', className)}>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
      )}
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
