// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const soundMocks = vi.hoisted(() => ({
  playChatMessageReceivedSound: vi.fn(),
  unlockChatSounds: vi.fn(),
}));
const inboxMocks = vi.hoisted(() => ({
  chatListener: undefined as ((payload?: unknown) => void) | undefined,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/club',
  useRouter: () => ({ push }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: { id: 1, clubId: 'us-biotoise', accessRole: 'admin' },
  }),
}));
vi.mock('@/lib/chat/chatSound', () => soundMocks);
vi.mock('@/hooks/useRealtimeInbox', () => ({
  subscribeInboxRealtime: (_channel: string, listener: (payload?: unknown) => void) => {
    inboxMocks.chatListener = listener;
    return () => {
      inboxMocks.chatListener = undefined;
    };
  },
}));

import { IncomingNotificationOverlay } from './IncomingNotificationOverlay';
import { setActiveChatRoomId } from '@/lib/notifications/incoming-banner';

describe('IncomingNotificationOverlay', () => {
  beforeEach(() => {
    push.mockClear();
    soundMocks.playChatMessageReceivedSound.mockClear();
    setActiveChatRoomId(null);
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile',
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '',
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    });
  });

  afterEach(() => cleanup());

  it('fait glisser un bandeau sonore au-dessus de l’écran pour un message reçu', () => {
    render(<IncomingNotificationOverlay />);
    expect(inboxMocks.chatListener).toEqual(expect.any(Function));
    act(() => {
      inboxMocks.chatListener?.({
        id: 'm-42',
        roomId: 'room-1',
        senderUserId: 2,
        senderName: 'Alice',
        content: 'On se voit à 18h ?',
        attachment: null,
        deletedAt: null,
      });
    });

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('On se voit à 18h ?')).toBeTruthy();
    expect(screen.getByRole('button').querySelector('img')?.getAttribute('src')).toBe('/pwa/icon-192.png');
    expect(soundMocks.playChatMessageReceivedSound).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button'));
    expect(push).toHaveBeenCalledWith('/club/chat?roomId=room-1');
  });

  it('n’affiche pas le bandeau pour la conversation déjà ouverte', () => {
    setActiveChatRoomId('room-1');
    render(<IncomingNotificationOverlay />);
    inboxMocks.chatListener?.({
      id: 'm-43',
      roomId: 'room-1',
      senderUserId: 2,
      senderName: 'Alice',
      content: 'Déjà ouvert',
    });
    expect(screen.queryByText('Déjà ouvert')).toBeNull();
    expect(soundMocks.playChatMessageReceivedSound).not.toHaveBeenCalled();
  });
});
