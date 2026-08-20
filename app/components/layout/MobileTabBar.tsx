'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import { Home, Calendar, CalendarDays, CalendarOff, Settings, Bell, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';

interface TabItem {
  href: string;
  label: string;
  icon: typeof Home;
  isActive: (pathname: string) => boolean;
  badge?: number;
}

const EDITABLE_TABS: Omit<TabItem, 'badge'>[] = [
  { href: '/', label: 'Accueil', icon: Home, isActive: (p) => p === '/' },
  { href: '/planning', label: 'Planning', icon: Calendar, isActive: (p) => p.startsWith('/planning') },
  { href: '/mon-calendrier', label: 'Calendrier', icon: CalendarDays, isActive: (p) => p.startsWith('/mon-calendrier') },
  { href: '/configuration', label: 'Configuration', icon: Settings, isActive: (p) => p.startsWith('/configuration') },
];

const PERSONAL_TABS: Omit<TabItem, 'badge'>[] = [
  { href: '/mon-planning', label: 'Planning', icon: Home, isActive: (p) => p === '/mon-planning' },
  { href: '/mes-indisponibilites', label: 'Disponib.', icon: CalendarOff, isActive: (p) => p.startsWith('/mes-indisponibilites') },
  { href: '/notifications', label: 'Notifs', icon: Bell, isActive: (p) => p.startsWith('/notifications') },
  { href: '/profil', label: 'Profil', icon: UserRound, isActive: (p) => p.startsWith('/profil') },
];

const HIDDEN_PREFIXES = ['/login', '/inscription', '/mot-de-passe-oublie', '/reinitialiser'];

export const MobileTabBar = memo(function MobileTabBar() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  const { unread } = useUnreadNotificationsCount();

  const isHiddenRoute = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isLoading || !user || isHiddenRoute) {
    return null;
  }

  const editable = canEdit(user.role);
  const tabs: TabItem[] = (editable ? EDITABLE_TABS : PERSONAL_TABS).map((tab) =>
    tab.href === '/notifications' ? { ...tab, badge: unread } : tab,
  );

  return (
    <>
      {/* Réserve l'espace occupé par la barre fixe pour ne pas masquer le contenu */}
      <div className="h-16 md:hidden" aria-hidden="true" />
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]"
        aria-label="Navigation principale"
      >
        <div className="grid h-16 grid-cols-4">
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
                <span className={cn('relative flex items-center justify-center h-7 w-11 rounded-full transition-colors', active && 'bg-primary/10')}>
                  <Icon className="h-5 w-5" />
                  {!!tab.badge && (
                    <span className="absolute top-0 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
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
