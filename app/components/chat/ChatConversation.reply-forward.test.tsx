// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatConversation } from './ChatConversation';

type Handler = (...args: unknown[]) => void;
type SendAck = (result: { ok: boolean; error?: string; message?: unknown }) => void;

class FakeSocket {
  connected = true;
  private handlers = new Map<string, Handler[]>();
  emitCalls: Array<{ event: string; payload: unknown }> = [];
  sendAckBehavior: (command: unknown, acknowledge: SendAck) => void = (_command, acknowledge) =>
    acknowledge({ ok: true, message: undefined });

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
    if (event === 'chat:send' && acknowledge) {
      this.sendAckBehavior(payload, acknowledge as SendAck);
    }
  }

  disconnect() {}

  trigger(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
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
};

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new (class extends FakeSocket {})();
    currentSocketRef.current = socket;
    return socket;
  },
}));

vi.mock('@/lib/utils/api', () => ({
  apiGet: vi.fn(async (url: string) => {
    if (url.includes('/messages')) {
      return { messages: [ORIGINAL_MESSAGE], peerReadSequence: 0, hasMoreBefore: false };
    }
    if (url === '/api/chat/rooms') {
      return { rooms: [{ id: 'room-target', type: 'channel', name: 'Salon cible' }] };
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

describe('ChatConversation — répondre et transférer un message (issue #268)', () => {
  afterEach(() => {
    cleanup();
    currentSocketRef.current = null;
  });

  it('replying to a message shows a quoted banner and includes replyToMessageId when sending', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    await screen.findByText('On se voit à 18h ?');

    fireEvent.click(screen.getByLabelText('Répondre à ce message'));

    expect(await screen.findByLabelText('Annuler la réponse')).toBeTruthy();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(1);
    expect(screen.getAllByText('On se voit à 18h ?').length).toBeGreaterThan(1);

    const textarea = screen.getByLabelText('Message');
    fireEvent.change(textarea, { target: { value: 'Oui, parfait' } });
    fireEvent.click(screen.getByLabelText('Envoyer'));

    const socket = currentSocketRef.current!;
    const sendCall = socket.emitCalls.find((call) => call.event === 'chat:send');
    expect(sendCall).toBeTruthy();
    expect((sendCall!.payload as { replyToMessageId: string | null }).replyToMessageId).toBe('m-original');

    // La bannière de réponse disparaît une fois le message envoyé.
    await waitFor(() => expect(screen.queryByLabelText('Annuler la réponse')).toBeNull());
  });

  it('cancelling a reply draft removes the banner without touching the composer content', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    await screen.findByText('On se voit à 18h ?');

    fireEvent.click(screen.getByLabelText('Répondre à ce message'));
    expect(await screen.findByLabelText('Annuler la réponse')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Annuler la réponse'));
    expect(screen.queryByLabelText('Annuler la réponse')).toBeNull();
  });

  it('forwarding a message opens a room picker and sends it to the chosen room with a forwarded-from marker', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    await screen.findByText('On se voit à 18h ?');

    fireEvent.click(screen.getByLabelText('Transférer ce message'));

    const targetRoomOption = await screen.findByText('Salon cible');
    fireEvent.click(targetRoomOption);

    const socket = currentSocketRef.current!;
    await waitFor(() => {
      const sendCall = socket.emitCalls.find(
        (call) => call.event === 'chat:send' && (call.payload as { roomId: string }).roomId === 'room-target',
      );
      expect(sendCall).toBeTruthy();
    });
    const forwardCall = socket.emitCalls.find(
      (call) => call.event === 'chat:send' && (call.payload as { roomId: string }).roomId === 'room-target',
    )!;
    expect((forwardCall.payload as { content: string }).content).toBe('On se voit à 18h ?');
    expect((forwardCall.payload as { forwardSourceMessageId: string }).forwardSourceMessageId).toBe('m-original');
  });

  it('opens reply and forward actions after a long press on a message', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const bubble = await screen.findByText('On se voit à 18h ?');
    const article = bubble.closest('article');
    expect(article).toBeTruthy();

    fireEvent.contextMenu(article!);
    expect(screen.getByRole('button', { name: 'Répondre' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));
    expect(await screen.findByLabelText('Annuler la réponse')).toBeTruthy();
  });
});
