// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatConversation } from './ChatConversation';
import { CHAT_REACTION_EMOJIS } from '@/lib/chat/reactions';

type Handler = (...args: unknown[]) => void;
type ReactAck = (result: { ok: boolean; error?: string; reactions?: unknown }) => void;

class FakeSocket {
  connected = true;
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
    if (event === 'chat:react' && acknowledge) {
      const command = payload as { emoji: string };
      (acknowledge as ReactAck)({
        ok: true,
        reactions: [{ emoji: command.emoji, count: 1, userIds: [1] }],
      });
    }
  }

  disconnect() {}
}

const { currentSocketRef } = vi.hoisted(() => ({ currentSocketRef: { current: null as FakeSocket | null } }));

const ORIGINAL_MESSAGE = {
  id: 'm-original',
  roomId: 'room-1',
  senderUserId: 2,
  senderName: 'Alice',
  clientMessageId: 'c-original',
  sequence: 1,
  content: 'On se voit à 18h ?',
  attachment: null,
  replyTo: null,
  forwardedFromName: null,
  createdAt: new Date(2026, 0, 1, 10, 0).toISOString(),
  deletedAt: null,
  reactions: [],
};

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new FakeSocket();
    currentSocketRef.current = socket;
    return socket;
  },
}));

vi.mock('@/lib/utils/api', () => ({
  apiGet: vi.fn(async (url: string) => {
    if (url.includes('/messages')) {
      return { messages: [ORIGINAL_MESSAGE], peerReadSequence: 0, hasMoreBefore: false };
    }
    return {};
  }),
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
Element.prototype.scrollIntoView = vi.fn();
if (!('hasPointerCapture' in Element.prototype)) {
  Object.assign(Element.prototype, { hasPointerCapture: () => false, setPointerCapture: () => undefined, releasePointerCapture: () => undefined });
}

describe('ChatConversation — réactions emoji', () => {
  afterEach(() => {
    cleanup();
    currentSocketRef.current = null;
  });

  it('shows the six click reactions and sends chat:react for one of them', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    await screen.findByText('On se voit à 18h ?');

    fireEvent.click(screen.getByText('On se voit à 18h ?'));

    for (const emoji of CHAT_REACTION_EMOJIS) {
      expect(screen.getAllByLabelText(`Réagir avec ${emoji}`).length).toBeGreaterThan(0);
    }

    fireEvent.click(screen.getAllByLabelText('Réagir avec 👍')[0]!);

    await waitFor(() => {
      expect(currentSocketRef.current?.emitCalls.some((call) => call.event === 'chat:react')).toBe(true);
    });
    const reactCall = currentSocketRef.current!.emitCalls.find((call) => call.event === 'chat:react')!;
    expect(reactCall.payload).toEqual({ roomId: 'room-1', messageId: 'm-original', emoji: '👍' });
    expect(await screen.findByLabelText('👍, 1 réaction')).toBeTruthy();
  });

  it('shows the six emojis in Actions du message after a long-press/context menu', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const bubble = await screen.findByText('On se voit à 18h ?');
    fireEvent.contextMenu(bubble.closest('article')!);

    expect(screen.getByText('Actions du message')).toBeTruthy();
    for (const emoji of CHAT_REACTION_EMOJIS) {
      expect(screen.getAllByLabelText(`Réagir avec ${emoji}`).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('button', { name: 'Répondre' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText('Réagir avec 😂').at(-1)!);
    await waitFor(() => {
      expect(screen.queryByText('Actions du message')).toBeNull();
    });
    const reactCall = currentSocketRef.current!.emitCalls.find((call) => call.event === 'chat:react')!;
    expect((reactCall.payload as { emoji: string }).emoji).toBe('😂');
  });
});
