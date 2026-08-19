'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/utils/api';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';

interface InvitationValidation {
  valid: boolean;
  email: string | null;
  role: UserRole;
  personNom: string | null;
  error?: string;
}

export default function InscriptionPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();

  const [invitation, setInvitation] = useState<InvitationValidation | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nom, setNom] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    apiGet<InvitationValidation>(`/api/invitations/${token}`)
      .then((data) => {
        setInvitation(data);
        if (data.email) {
          setEmail(data.email);
        }
      })
      .catch((err) => {
        setValidationError(err instanceof Error ? err.message : 'Lien d\'invitation invalide');
      })
      .finally(() => setIsValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await apiPost(`/api/invitations/${token}/accept`, { email, password, nom });
      toast.success('Inscription réussie');
      router.push('/');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <LoadingSpinner text="Vérification du lien d'invitation..." />
      </div>
    );
  }

  if (validationError || !invitation?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Lien invalide</CardTitle>
            <CardDescription className="text-center">
              {validationError || invitation?.error || 'Ce lien d\'invitation n\'est plus valide.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Créer votre compte
          </CardTitle>
          <CardDescription className="text-center">
            Vous êtes invité(e) en tant que {ROLE_LABELS[invitation.role]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom</Label>
              <Input
                id="nom"
                type="text"
                placeholder="Votre nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                autoFocus
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting || !!invitation.email}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="8 caractères minimum"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isSubmitting}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !email || !password || !nom}
            >
              {isSubmitting ? 'Création...' : 'Créer mon compte'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
