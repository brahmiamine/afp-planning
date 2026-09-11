export const metadata = {
  title: 'Hors ligne',
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Connexion indisponible</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Vérifiez votre réseau, puis rouvrez l&apos;application.
      </p>
    </main>
  );
}
