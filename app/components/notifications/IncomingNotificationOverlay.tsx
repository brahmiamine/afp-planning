'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { subscribeInboxRealtime } from '@/hooks/useRealtimeInbox';
import { playChatMessageReceivedSound, unlockChatSounds } from '@/lib/chat/chatSound';
import { chatRoomHref, notificationSpace } from '@/lib/notifications/destinations';
import { buildPwaIconUrl } from '@/lib/pwa/icons';
import { isMobileUserAgent } from '@/lib/pwa/install-prompt';
import {
  incomingBannerFromChatMessage,
  incomingBannerFromPushPayload,
  shouldSuppressIncomingBanner,
  type IncomingBanner,
} from '@/lib/notifications/incoming-banner';

const DISPLAY_MS = 5_500;

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 1023px)').matches || isMobileUserAgent(navigator.userAgent);
}

export function IncomingNotificationOverlay() {
  const { user } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const [banner, setBanner] = useState<IncomingBanner | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const shownIds = useRef(new Set<string>());

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => {
      setBanner(null);
      setLeaving(false);
    }, 280);
  }, []);

  const present = useCallback((next: IncomingBanner, senderUserId?: number) => {
    if (!isMobileViewport()) return;
    if (shouldSuppressIncomingBanner(next, user?.id, senderUserId)) return;
    if (shownIds.current.has(next.id)) return;
    shownIds.current.add(next.id);
    window.setTimeout(() => shownIds.current.delete(next.id), 12_000);

    setLeaving(false);
    setBanner(next);
    playChatMessageReceivedSound();
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => dismiss(), DISPLAY_MS);
  }, [dismiss, user?.id]);

  useEffect(() => {
    const unlock = () => unlockChatSounds();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const space = notificationSpace(user.accessRole);
    return subscribeInboxRealtime('chat', (payload) => {
      if (!payload || typeof payload !== 'object') return;
      const message = payload as {
        id?: string;
        roomId?: string;
        senderUserId?: number;
        senderName?: string;
        content?: string;
        attachment?: unknown;
        deletedAt?: string | null;
      };
      if (!message.id || !message.roomId || typeof message.senderUserId !== 'number') return;
      const bannerFromChat = incomingBannerFromChatMessage({
        id: message.id,
        roomId: message.roomId,
        senderUserId: message.senderUserId,
        senderName: message.senderName || 'Nouveau message',
        content: message.content || '',
        attachment: message.attachment,
        deletedAt: message.deletedAt,
      }, chatRoomHref(space, message.roomId));
      if (bannerFromChat) present(bannerFromChat, message.senderUserId);
    });
  }, [present, user]);

  useEffect(() => {
    if (!user || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    const onMessage = (event: MessageEvent) => {
      const bannerFromPush = incomingBannerFromPushPayload(event.data as {
        type?: string;
        title?: string;
        body?: string;
        url?: string;
        icon?: string;
        notificationId?: string;
      });
      if (bannerFromPush) present(bannerFromPush);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [present, user]);

  useEffect(() => () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
  }, []);

  if (!user || !banner) return null;

  const iconSrc = banner.icon || buildPwaIconUrl({ clubId: user.clubId, size: 192, variant: 'plain' });

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center px-3 pt-[max(0.65rem,env(safe-area-inset-top))] lg:hidden">
      <button
        type="button"
        className={`pointer-events-auto flex w-full max-w-lg items-center gap-3 overflow-hidden rounded-2xl border bg-card/95 px-3 py-2.5 text-left shadow-2xl backdrop-blur ${leaving ? 'animate-incoming-banner-out' : 'animate-incoming-banner-in'}`}
        onClick={() => {
          dismiss();
          const href = banner.href.startsWith('http') ? new URL(banner.href).pathname + new URL(banner.href).search : banner.href;
          if (href !== pathname) router.push(href);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{banner.title}</span>
          <span className="mt-0.5 block overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
            <span className={banner.body.length > 42 ? 'inline-block animate-incoming-marquee' : ''}>
              {banner.body}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
