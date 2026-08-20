'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Mail, KeyRound } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const data = await apiPost<{ message: string; deliveryConfigured: boolean; resetUrl?: string }>('/api/auth/password-reset/request', { email });
      setSent(true);
      setDevUrl(data.resetUrl ?? null);
      toast.success(data.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Demande impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Mot de passe oublié</CardTitle><CardDescription>Entrez votre email. Si le compte existe, un lien temporaire sera préparé.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {!sent ? (
            <>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" /></div>
              <Button className="w-full" onClick={submit} disabled={loading || !email}><Mail className="mr-2 h-4 w-4" /> {loading ? 'Envoi...' : 'Envoyer les instructions'}</Button>
            </>
          ) : (
            <div className="space-y-3 text-sm"><p>Si cette adresse correspond à un compte actif, utilisez le lien reçu pour choisir un nouveau mot de passe.</p>{devUrl && <Button asChild variant="outline" className="w-full"><Link href={devUrl}>Ouvrir le lien de développement</Link></Button>}</div>
          )}
          <Button variant="ghost" asChild className="w-full"><Link href="/login">Retour à la connexion</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
