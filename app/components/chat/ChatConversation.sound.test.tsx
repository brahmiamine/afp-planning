// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatConversation } from './ChatConversation';

type Handler = (...args: unknown[]) => void;
type SendAck = (result: { ok: boolean; error?: string; message?: unknown }) => void;

class FakeSocket {
  connected = true;
  private handlers = new Map<string, Handler[]>();
  sendAckBehavior: (command: unknown, acknowledge: SendAck) => void = (_command, acknowledge) =>
    acknowledge({ ok: true, message: undefined });

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  off() {}

  emit(event: string, payload: unknown, acknowledge?: Handler) {
    if (event === 'chat:resume' && acknowledge) {
      acknowledge({ ok: true, messages: [] });
      return;
    }
    if (event === 'chat:read' && acknowledge) {
      acknowledge({ ok: true });
      return;
    }
    if (event === 'chat:send' && acknowledge) {
      this.sendAckBehavior(payload, acknowledge as SendAck);
    }
  }

  disconnect() {}

  trigger(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

const { currentSocketRef, soundMocks } = vi.hoisted(() => ({
  currentSocketRef: { current: null as FakeSocket | null },
  soundMocks: {
    playChatMessageSentSound: vi.fn(),
    playChatMessageReceivedSound: vi.fn(),
    unlockChatSounds: vi.fn(),
  },
}));

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new (class extends FakeSocket {})();
    currentSocketRef.current = socket;
    return socket;
  },
}));

vi.mock('@/lib/chat/chatSound', () => soundMocks);

vi.mock('@/lib/utils/api', () => ({
  apiGet: vi.fn(async () => ({ messages: [], peerReadSequence: 0 })),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/app/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 1, nom: 'Moi', clubId: 'afp', accessRole: 'admin' } }),
}));

function stubMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

Element.prototype.scrollTo = vi.fn();

function baseMessage(overrides: Record<string, unknown>) {
  return {
    id: 'm1',
    roomId: 'room-1',
    senderUserId: 2,
    senderName: 'Alice',
    clientMessageId: 'c1',
    sequence: 1,
    content: 'Salut',
    attachment: null,
    replyTo: null,
    forwardedFromName: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ChatConversation — sons du chat (issue #269)', () => {
  afterEach(() => {
    cleanup();
    currentSocketRef.current = null;
    soundMocks.playChatMessageSentSound.mockClear();
    soundMocks.playChatMessageReceivedSound.mockClear();
    soundMocks.unlockChatSounds.mockClear();
  });

  it('plays the sent sound once the server acknowledges a send', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;
    socket.sendAckBehavior = (_command, acknowledge) => acknowledge({
      ok: true,
      message: baseMessage({ id: 'sent-1', senderUserId: 1, content: 'Salut', clientMessageId: 'whatever' }),
    });

    const textarea = await screen.findByLabelText('Message');
    fireEvent.change(textarea, { target: { value: 'Salut' } });
    fireEvent.click(screen.getByLabelText('Envoyer'));

    await waitFor(() => expect(soundMocks.playChatMessageSentSound).toHaveBeenCalledTimes(1));
    expect(soundMocks.playChatMessageReceivedSound).not.toHaveBeenCalled();
  });

  it('does not play the received sound for one\'s own message echoed back', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;

    socket.trigger('chat:message', baseMessage({ id: 'own-echo', senderUserId: 1 }));
    await screen.findByText('Salut');

    expect(soundMocks.playChatMessageReceivedSound).not.toHaveBeenCalled();
  });

  it('plays the received sound for a genuinely new message from someone else', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;

    socket.trigger('chat:message', baseMessage({ id: 'from-alice', senderUserId: 2 }));

    await waitFor(() => expect(soundMocks.playChatMessageReceivedSound).toHaveBeenCalledTimes(1));
  });

  it('does not replay the received sound when an existing message is re-broadcast (e.g. moderation update)', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;

    socket.trigger('chat:message', baseMessage({ id: 'from-alice', senderUserId: 2, content: 'Salut' }));
    await waitFor(() => expect(soundMocks.playChatMessageReceivedSound).toHaveBeenCalledTimes(1));

    // Même id, republié après une modération (contenu vidé) : ce n'est pas une nouvelle arrivée.
    socket.trigger('chat:message', baseMessage({ id: 'from-alice', senderUserId: 2, content: '', deletedAt: new Date().toISOString() }));
    await screen.findByText('Message supprimé');

    expect(soundMocks.playChatMessageReceivedSound).toHaveBeenCalledTimes(1);
  });
});
