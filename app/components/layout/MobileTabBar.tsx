'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import { Home, Calendar, CalendarDays, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';

interface TabItem {
  href: string;
  label: string;
  icon: typeof Home;
  isActive: (pathname: string) => boolean;
}

const BASE_TABS: TabItem[] = [
  { href: '/', label: 'Accueil', icon: Home, isActive: (p) => p === '/' },
  { href: '/planning', label: 'Planning', icon: Calendar, isActive: (p) => p.startsWith('/planning') },
  { href: '/mon-calendrier', label: 'Calendrier', icon: CalendarDays, isActive: (p) => p.startsWith('/mon-calendrier') },
];

const CONFIG_TAB: TabItem = {
  href: '/configuration',
  label: 'Configuration',
  icon: Settings,
  isActive: (p) => p.startsWith('/configuration'),
};

const HIDDEN_PREFIXES = ['/login', '/inscription'];

export const MobileTabBar = memo(function MobileTabBar() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();

  const isHiddenRoute = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isLoading || !user || isHiddenRoute) {
    return null;
  }

  const tabs = canEdit(user.role) ? [...BASE_TABS, CONFIG_TAB] : BASE_TABS;

  return (
    <>
      {/* Réserve l'espace occupé par la barre fixe pour ne pas masquer le contenu */}
      <div className="h-16 md:hidden" aria-hidden="true" />
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]"
        aria-label="Navigation principale"
      >
        <div className={cn('grid h-16', tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
          {tabs.map((tab) => {
            const active = tab.isActive(pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('flex items-center justify-center h-7 w-11 rounded-full transition-colors', active && 'bg-primary/10')}>
                  <Icon className="h-5 w-5" />
                </span>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
});
