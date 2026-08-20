'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppSettings } from '@/hooks/useAppSettings';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return buffer;
}

async function getPushConfig(): Promise<PushConfig> {
  const response = await fetch('/api/push/config', { cache: 'no-store' });
  if (!response.ok) return { enabled: false, publicKey: null };
  return response.json() as Promise<PushConfig>;
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

async function syncSubscription(): Promise<boolean> {
  const config = await getPushConfig();
  if (!config.enabled || !config.publicKey) return false;

  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToArrayBuffer(config.publicKey),
    });
  }

  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) {
    throw new Error("Impossible d'enregistrer ce téléphone pour les notifications");
  }

  return true;
}

function setLinkHref(rel: string, href: string): void {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const { settings } = useAppSettings();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [installDismissed, setInstallDismissed] = useState(false);
  const [pushDismissed, setPushDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    if ('Notification' in window) setPushPermission(Notification.permission);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.error('Service worker registration failed:', error);
      });
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
      toast.success(`${settings.clubName} Planning est installé sur votre téléphone`);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [settings.clubName]);

  useEffect(() => {
    if (!user) return;

    const version = `${settings.clubLogo.length}-${settings.primaryColor.replace('#', '')}`;
    const iconHref = `/api/pwa/icon?clubId=${encodeURIComponent(user.clubId)}&size=192&v=${encodeURIComponent(version)}`;
    setLinkHref('apple-touch-icon', iconHref);
    setLinkHref('manifest', `/manifest.webmanifest?clubId=${encodeURIComponent(user.clubId)}&v=${encodeURIComponent(version)}`);

    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      document.head.appendChild(themeColor);
    }
    themeColor.content = settings.primaryColor;
  }, [settings.clubLogo, settings.primaryColor, user]);

  useEffect(() => {
    if (!user || !pushSupported || pushPermission !== 'granted') return;
    syncSubscription().catch((error) => console.error('Push subscription sync failed:', error));
  }, [user, pushSupported, pushPermission]);

  const canOfferInstall = useMemo(
    () => !standalone && !installDismissed && (Boolean(installPrompt) || isIos()),
    [standalone, installDismissed, installPrompt],
  );

  const canOfferPush = Boolean(
    user && standalone && pushSupported && pushPermission !== 'granted' && !pushDismissed,
  );

  const installApp = useCallback(async () => {
    if (!installPrompt) {
      if (isIos()) {
        toast.info(`Pour installer ${settings.clubName} Planning : touchez Partager, puis « Sur l'écran d'accueil ».`);
      }
      return;
    }

    setBusy(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setStandalone(true);
        setInstallPrompt(null);
      }
    } finally {
      setBusy(false);
    }
  }, [installPrompt, settings.clubName]);

  const enablePush = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        toast.error('Les notifications ont été refusées dans les réglages du téléphone.');
        return;
      }

      const enabled = await syncSubscription();
      if (enabled) {
        toast.success('Notifications smartphone activées');
      } else {
        toast.error("Les clés VAPID ne sont pas encore configurées sur le serveur.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'activer les notifications");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <>
      {canOfferInstall && (
        <div className="sticky top-0 z-[70] flex items-center justify-between gap-2 border-b bg-primary px-3 py-2 text-primary-foreground lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            {settings.clubLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.clubLogo} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-1" />
            ) : (
              <Download className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate text-sm font-medium">Installer {settings.clubName} Planning</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="secondary" onClick={installApp} disabled={busy} className="min-h-9">
              Installer
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 text-primary-foreground hover:text-primary"
              onClick={() => setInstallDismissed(true)}
              aria-label="Masquer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {canOfferPush && (
        <div className="sticky top-0 z-[70] flex items-center justify-between gap-2 border-b bg-primary px-3 py-2 text-primary-foreground lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <BellRing className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm font-medium">Recevoir les désignations sur votre téléphone</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="secondary" onClick={enablePush} disabled={busy} className="min-h-9">
              Activer
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 text-primary-foreground hover:text-primary"
              onClick={() => setPushDismissed(true)}
              aria-label="Masquer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {children}
    </>
  );
}
