'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { toast } from 'sonner';
import { apiPost, apiPut } from '@/lib/utils/api';
import { INVITABLE_ROLES, ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import type { ManagedUser } from '@/app/hooks/useUsers';

interface UserFormProps {
  user?: ManagedUser;
}

interface UserFormState {
  email: string;
  password: string;
  nom: string;
  role: UserRole;
  active: boolean;
  personNom: string;
}

function initialState(user?: ManagedUser): UserFormState {
  return {
    email: user?.email || '',
    password: '',
    nom: user?.nom || '',
    role: user?.role || 'admin',
    active: user?.active ?? true,
    personNom: user?.personNom || '',
  };
}

export function UserForm({ user }: UserFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<UserFormState>(() => initialState(user));
  const [isSaving, setIsSaving] = useState(false);

  const handleCancel = () => router.push('/configuration?tab=utilisateurs');

  const handleSubmit = async () => {
    if (!form.email.trim() || !form.nom.trim()) {
      toast.error('Email et nom sont requis');
      return;
    }
    if (!user && form.password.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setIsSaving(true);
    try {
      if (user) {
        await apiPut(`/api/users/${user.id}`, {
          nom: form.nom,
          role: form.role,
          active: form.active,
          personNom: form.personNom || null,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success('Utilisateur modifié');
      } else {
        await apiPost('/api/users', {
          email: form.email,
          password: form.password,
          nom: form.nom,
          role: form.role,
          personNom: form.personNom || null,
        });
        toast.success('Utilisateur créé');
      }
      router.push('/configuration?tab=utilisateurs');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{user ? "Modifier l'utilisateur" : 'Ajouter un utilisateur'}</CardTitle>
        <CardDescription>
          {user ? "Modifiez les informations de l'utilisateur" : 'Créez un compte directement (sans passer par une invitation)'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="user-nom">Nom</Label>
          <Input
            id="user-nom"
            value={form.nom}
            onChange={(e) => setForm((prev) => ({ ...prev, nom: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-email">Email</Label>
          <Input
            id="user-email"
            type="email"
            value={form.email}
            disabled={!!user}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-password">
            Mot de passe {user && '(laisser vide pour ne pas changer)'}
          </Label>
          <Input
            id="user-password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-role">Rôle</Label>
          <select
            id="user-role"
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
          >
            <option value="superadmin">{ROLE_LABELS.superadmin}</option>
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-person-nom">Lier à un officiel/encadrant (optionnel)</Label>
          <Input
            id="user-person-nom"
            value={form.personNom}
            onChange={(e) => setForm((prev) => ({ ...prev, personNom: e.target.value }))}
          />
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <input
              id="user-active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
            />
            <Label htmlFor="user-active">Compte actif</Label>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleCancel} className="w-full sm:w-auto">
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving} className="w-full sm:w-auto">
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
