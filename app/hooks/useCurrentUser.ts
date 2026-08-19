'use client';

import { useContext } from 'react';
import { AuthContext } from '@/app/components/providers/auth-provider';

export function useCurrentUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useCurrentUser doit être utilisé à l\'intérieur de AuthProvider');
  }
  return ctx;
}
