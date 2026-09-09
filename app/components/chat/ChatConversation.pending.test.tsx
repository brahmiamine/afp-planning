// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatConversation } from './ChatConversation';

type Handler = (...args: unknown[]) => void;
type SendAck = (result: { ok: boolean; error?: string; message?: unknown }) => void;

class FakeSocket {
  connected = false;
  private handlers = new Map<string, Handler[]>();
  sendAckBehavior: 'silent' | ((command: unknown, acknowledge: SendAck) => void) = 'silent';

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
    if (event === 'chat:send') {
      if (!this.connected) return; // hors ligne : la commande reste en attente côté client
      if (typeof this.sendAckBehavior === 'function' && acknowledge) {
        this.sendAckBehavior(payload, acknowledge as SendAck);
      }
      return;
    }
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

describe('ChatConversation — écho optimiste et retry hors-ligne (issue #260)', () => {
  afterEach(() => {
    cleanup();
    currentSocketRef.current = null;
  });

  it('shows a sent message as pending ("Envoi en cours…") while offline', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-1" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    // Le socket reste déconnecté (hors ligne) tout au long de ce test.

    const textarea = await screen.findByLabelText('Message');
    fireEvent.change(textarea, { target: { value: 'Message hors ligne' } });
    fireEvent.click(screen.getByLabelText('Envoyer'));

    expect(await screen.findByText('Message hors ligne')).toBeTruthy();
    expect(screen.getByText('Envoi en cours…')).toBeTruthy();
  });

  it('shows a retry/delete action when the ack reports a failure, and retry clears the error', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-2" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;

    // Le socket devient joignable, mais le serveur refuse l'envoi (ex. accès révoqué).
    socket.connected = true;
    socket.sendAckBehavior = (_command, acknowledge) => acknowledge({ ok: false, error: 'Accès refusé' });
    socket.trigger('connect');

    const textarea = await screen.findByLabelText('Message');
    fireEvent.change(textarea, { target: { value: 'Message refusé' } });
    fireEvent.click(screen.getByLabelText('Envoyer'));

    expect(await screen.findByText('Accès refusé')).toBeTruthy();
    expect(screen.getByText('Réessayer')).toBeTruthy();
    expect(screen.getByText('Supprimer')).toBeTruthy();

    // Un nouveau essai qui réussit fait disparaître l'état d'erreur et le message en attente.
    socket.sendAckBehavior = (_command, acknowledge) => acknowledge({
      ok: true,
      message: {
        id: 'm1',
        roomId: 'room-2',
        senderUserId: 1,
        senderName: 'Moi',
        clientMessageId: 'whatever',
        sequence: 1,
        content: 'Message refusé',
        attachment: null,
        createdAt: new Date().toISOString(),
      },
    });
    fireEvent.click(screen.getByText('Réessayer'));

    await waitFor(() => expect(screen.queryByText('Accès refusé')).toBeNull());
  });

  it('removes a pending message when "Supprimer" is clicked, without contacting the server', async () => {
    stubMatchMedia();
    render(<ChatConversation roomId="room-3" title="Test" />);

    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());
    const socket = currentSocketRef.current!;
    socket.connected = true;
    socket.sendAckBehavior = (_command, acknowledge) => acknowledge({ ok: false, error: 'Refusé' });
    socket.trigger('connect');

    const textarea = await screen.findByLabelText('Message');
    fireEvent.change(textarea, { target: { value: 'À supprimer' } });
    fireEvent.click(screen.getByLabelText('Envoyer'));

    await screen.findByText('Supprimer');
    fireEvent.click(screen.getByText('Supprimer'));

    await waitFor(() => expect(screen.queryByText('À supprimer')).toBeNull());
  });
});
