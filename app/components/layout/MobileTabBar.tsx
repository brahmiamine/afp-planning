'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import {
  Bell,
  Calendar,
  CalendarDays,
  CalendarOff,
  Home,
  LayoutDashboard,
  MessageCircle,
  UserRound,
} from 'lucide-react';
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

const isPlanningSection = (pathname: string) =>
  pathname === '/planning' || (pathname.startsWith('/planning/') && !pathname.startsWith('/planning/week-end'));

const EDITABLE_TABS: Omit<TabItem, 'badge'>[] = [
  { href: '/', label: 'Accueil', icon: Home, isActive: (p) => p === '/' },
  { href: '/planning', label: 'Planning', icon: Calendar, isActive: isPlanningSection },
  { href: '/planning/week-end', label: 'Week-end', icon: CalendarDays, isActive: (p) => p.startsWith('/planning/week-end') },
  { href: '/chat', label: 'Chat', icon: MessageCircle, isActive: (p) => p.startsWith('/chat') },
  { href: '/notifications', label: 'Notifs', icon: Bell, isActive: (p) => p.startsWith('/notifications') },
];

const SUPERADMIN_TABS: Omit<TabItem, 'badge'>[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, isActive: (p) => p.startsWith('/dashboard') },
  { href: '/planning', label: 'Planning', icon: Calendar, isActive: isPlanningSection },
  { href: '/planning/week-end', label: 'Week-end', icon: CalendarDays, isActive: (p) => p.startsWith('/planning/week-end') },
  { href: '/chat', label: 'Chat', icon: MessageCircle, isActive: (p) => p.startsWith('/chat') },
  { href: '/notifications', label: 'Notifs', icon: Bell, isActive: (p) => p.startsWith('/notifications') },
];

const PERSONAL_TABS: Omit<TabItem, 'badge'>[] = [
  { href: '/mon-planning', label: 'Planning', icon: Home, isActive: (p) => p === '/mon-planning' },
  { href: '/mes-indisponibilites', label: 'Disponib.', icon: CalendarOff, isActive: (p) => p.startsWith('/mes-indisponibilites') },
  { href: '/chat', label: 'Chat', icon: MessageCircle, isActive: (p) => p.startsWith('/chat') },
  { href: '/notifications', label: 'Notifs', icon: Bell, isActive: (p) => p.startsWith('/notifications') },
  { href: '/profil', label: 'Profil', icon: UserRound, isActive: (p) => p.startsWith('/profil') },
];

const HIDDEN_PREFIXES = ['/login', '/plateforme/login', '/inscription', '/mot-de-passe-oublie', '/reinitialiser', '/partage/'];

export const MobileTabBar = memo(function MobileTabBar() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  const { unread } = useUnreadNotificationsCount();
  const isHiddenRoute = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isLoading || !user || isHiddenRoute) return null;

  const editable = canEdit(user.roles);
  const sourceTabs = user.roles.includes('superadmin')
    ? SUPERADMIN_TABS
    : editable
      ? EDITABLE_TABS
      : PERSONAL_TABS;
  const tabs: TabItem[] = sourceTabs.map((tab) =>
    tab.href === '/notifications' ? { ...tab, badge: unread } : tab,
  );

  return (
    <>
      <div className="h-[calc(4.5rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Navigation principale"
      >
        <div className="mx-auto grid h-[4.5rem] max-w-3xl grid-cols-5 px-1 sm:px-4">
          {tabs.map((tab) => {
            const active = tab.isActive(pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[10px] font-medium transition-colors sm:text-xs',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-8 w-11 items-center justify-center rounded-full transition-colors',
                    active && 'bg-primary/10',
                  )}
                >
                  <Icon className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
                  {!!tab.badge && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
});
