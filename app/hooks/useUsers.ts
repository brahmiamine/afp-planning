'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/utils/api';
import type { UserRole } from '@/lib/auth/roles';
import type { PersonLink } from '@/lib/planning/person-link';

export interface ManagedUser {
  id: number;
  email: string;
  nom: string;
  roles: UserRole[];
  active: boolean;
  personLinks: PersonLink[];
  createdAt: string;
  updatedAt: string;
}

interface UsersData {
  users: ManagedUser[];
}

export function useUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiGet<UsersData>('/api/users');
      setUsers(data.users || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des utilisateurs';
      setError(errorMessage);
      console.error('Error loading users:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return {
    users,
    isLoading,
    error,
    reload: loadUsers,
  };
}
