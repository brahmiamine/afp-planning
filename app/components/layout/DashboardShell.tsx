'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { ThemeToggle } from '@/app/components/ui/theme-toggle';
import { cn } from '@/lib/utils';

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  /** Correspondance exacte uniquement (par défaut : préfixe /href/...). */
  exact?: boolean;
}

export interface DashboardNavSection {
  title?: string;
  items: DashboardNavItem[];
}

interface DashboardShellProps {
  brandName: string;
  brandLogo?: string | null;
  sections: DashboardNavSection[];
  userLabel?: string;
  onLogout: () => void;
  children: ReactNode;
}

function isItemActive(pathname: string, item: DashboardNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, active, onNavigate }: { item: DashboardNavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {!!item.badge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {item.badge > 9 ? '9+' : item.badge}
        </span>
      )}
    </Link>
  );
}

function SidebarNav({ sections, pathname, onNavigate }: { sections: DashboardNavSection[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="space-y-1">
          {section.title && (
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
          )}
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} active={isItemActive(pathname, item)} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function DashboardShell({ brandName, brandLogo, sections, userLabel, onLogout, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const brand = (
    <div className="flex items-center gap-2.5 px-4 py-4">
      {brandLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brandLogo} alt={brandName} className="h-9 w-9 shrink-0 rounded-lg border border-border bg-white object-contain p-0.5" />
      )}
      <span className="min-w-0 flex-1 truncate text-base font-bold text-foreground">{brandName}</span>
    </div>
  );

  const footer = (
    <div className="space-y-2 border-t border-border p-3">
      {userLabel && <p className="truncate px-1 text-xs text-muted-foreground">{userLabel}</p>}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="outline" size="sm" className="flex-1 justify-start gap-2" onClick={onLogout}>
          <LogOut className="h-4 w-4" /> Déconnexion
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border lg:bg-card">
        {brand}
        <SidebarNav sections={sections} pathname={pathname} />
        {footer}
      </aside>

      {/* Barre mobile */}
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2.5 lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setIsMobileNavOpen(true)} aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </Button>
        <span className="truncate text-sm font-bold text-foreground">{brandName}</span>
        <ThemeToggle />
      </div>

      {/* Tiroir mobile */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsMobileNavOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between">
              {brand}
              <Button variant="ghost" size="icon" className="mr-3" onClick={() => setIsMobileNavOpen(false)} aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarNav sections={sections} pathname={pathname} onNavigate={() => setIsMobileNavOpen(false)} />
            {footer}
          </div>
        </div>
      )}

      <main className="min-h-screen flex-1 lg:pl-64">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-5">
          {children}
        </div>
      </main>
    </div>
  );
}
