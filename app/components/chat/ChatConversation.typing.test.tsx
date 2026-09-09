// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatConversation } from './ChatConversation';

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  private handlers = new Map<string, Handler[]>();
  emitCalls: Array<{ event: string; payload: unknown }> = [];

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  off() {}

  emit(event: string, payload: unknown, acknowledge?: Handler) {
    this.emitCalls.push({ event, payload });
    if (event === 'chat:resume' && acknowledge) {
      acknowledge({ ok: true, messages: [] });
      return;
    }
    if (event === 'chat:read' && acknowledge) {
      acknowledge({ ok: true });
      return;
    }
    // chat:typing (issue #267) : fire-and-forget, pas d'accusé.
  }

  disconnect() {}

  trigger(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

const { currentSocketRef } = vi.hoisted(() => ({ currentSocketRef: { current: null as FakeSocket | null } }));

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new (class extends FakeSocket {})();
    currentSocketRef.current = socket;
    return socket;
  },
}));

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

// jsdom n'implémente pas Element.scrollTo (utilisé par l'ancrage automatique en bas du fil).
Element.prototype.scrollTo = vi.fn();

describe('ChatConversation — indicateur de frappe (issue #267)', () => {
  afterEach(() => {
    cleanup();
    currentSocketRef.current = null;
    vi.useRealTimers();
  });

  it('shows "X écrit…" when a chat:typing event arrives for this room, from someone else', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;

    socket.trigger('chat:typing', { roomId: 'room-1', userId: 2, nom: 'Alice' });

    expect(await screen.findByText('Alice écrit…')).toBeTruthy();
  });

  it('ignores a chat:typing event for a different room, or from oneself', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;

    socket.trigger('chat:typing', { roomId: 'room-other', userId: 2, nom: 'Alice' });
    socket.trigger('chat:typing', { roomId: 'room-1', userId: 1, nom: 'Moi' });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText('Alice écrit…')).toBeNull();
    expect(screen.queryByText('Moi écrit…')).toBeNull();
  });

  it('hides the indicator once a message arrives in the room', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;

    socket.trigger('chat:typing', { roomId: 'room-1', userId: 2, nom: 'Alice' });
    await screen.findByText('Alice écrit…');

    socket.trigger('chat:message', {
      id: 'm1',
      roomId: 'room-1',
      senderUserId: 2,
      senderName: 'Alice',
      clientMessageId: 'c1',
      sequence: 1,
      content: 'Salut',
      attachment: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    });

    await waitFor(() => expect(screen.queryByText('Alice écrit…')).toBeNull());
  });

  it('keeps a participant listed as typing after another one with the same name stops (issue #267, revue Codex)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;

    // Deux participants distincts (userId différents) partageant le même nom : `nom`
    // n'est pas unique sur UserSchema.
    socket.trigger('chat:typing', { roomId: 'room-1', userId: 2, nom: 'Alice' });
    await waitFor(() => expect(screen.getByText('Alice écrit…')).toBeTruthy());

    vi.advanceTimersByTime(1_000);
    socket.trigger('chat:typing', { roomId: 'room-1', userId: 3, nom: 'Alice' });

    // Le minuteur du userId 2 (déclenché en premier) expire ; celui du userId 3 (déclenché
    // 1 s plus tard) est encore actif : l'indicateur doit rester visible.
    vi.advanceTimersByTime(3_100);
    expect(screen.getByText('Alice écrit…')).toBeTruthy();

    vi.advanceTimersByTime(1_000);
    await waitFor(() => expect(screen.queryByText('Alice écrit…')).toBeNull());
  });

  it('emits chat:typing (throttled) while the composer is non-empty, but not for own echoes', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;
    socket.connected = true;

    const textarea = await screen.findByLabelText('Message');
    fireEvent.change(textarea, { target: { value: 'B' } });
    fireEvent.change(textarea, { target: { value: 'Bo' } });
    fireEvent.change(textarea, { target: { value: 'Bon' } });

    const typingCalls = socket.emitCalls.filter((call) => call.event === 'chat:typing');
    // Throttlé à 1 émission / 2 s : trois frappes rapprochées ne doivent produire qu'un seul envoi.
    expect(typingCalls).toHaveLength(1);
    expect(typingCalls[0]!.payload).toEqual({ roomId: 'room-1' });
  });
});
