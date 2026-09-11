'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Building2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { toast } from 'sonner';

export default function PlatformLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/plateforme/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json() as { error?: string };
      if (response.ok) {
        toast.success('Connexion réussie');
        router.push('/plateforme');
        router.refresh();
      } else {
        toast.error(data.error || 'Email ou mot de passe incorrect');
      }
    } catch {
      toast.error('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-[#101A35] p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-36 -top-36 h-96 w-96 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,50,135,0.55), transparent 70%)' }}
      />

      <div className="relative flex flex-col items-center gap-3.5 text-center">
        <Image src="/branding/clubika-icon.png" alt="" width={44} height={44} className="h-11 w-11" priority />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--gold)]/15 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--gold)]">
          <Building2 className="h-3 w-3" />
          Administration plateforme
        </span>
        <p className="text-sm text-white/55">Réservé aux administrateurs de la plateforme Clubika</p>
      </div>

      <Card className="relative w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-2xl font-bold">Connexion</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@plateforme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="Votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !email || !password}>
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
