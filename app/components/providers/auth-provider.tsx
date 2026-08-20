'use client';

import { createContext, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiGet } from '@/lib/utils/api';
import { isReadOnlyRole, type UserRole } from '@/lib/auth/roles';
import type { PersonLink } from '@/lib/planning/person-link';
import type { NotifyChannel } from '@/lib/auth/session';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';

export interface CurrentUser {
  id: number;
  email: string;
  nom: string;
  roles: UserRole[];
  personLinks: PersonLink[];
  active: boolean;
  icalToken: string;
  notifyChannel: NotifyChannel;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  reload: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PREFIXES = ['/login', '/inscription/', '/mot-de-passe-oublie', '/reinitialiser/'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      const data = await apiGet<CurrentUser>('/api/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isLoading) return;

    const isPublicPath = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
    if (!user && !isPublicPath) {
      router.replace('/login');
      return;
    }

    if (
      user &&
      isReadOnlyRole(user.roles) &&
      (pathname === '/' || pathname === '/planning' || pathname.startsWith('/configuration'))
    ) {
      router.replace('/mon-planning');
    }
  }, [isLoading, user, pathname, router]);

  const isPublicPath = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  if (isLoading && !isPublicPath) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, reload: load }}>
      {children}
    </AuthContext.Provider>
  );
}
