// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatConversation } from './ChatConversation';

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  connected = true;
  private handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  off() {}

  emit(event: string, _payload: unknown, acknowledge?: Handler) {
    if (event === 'chat:resume' && acknowledge) {
      acknowledge({ ok: true, messages: [] });
      return;
    }
    if (event === 'chat:read' && acknowledge) {
      acknowledge({ ok: true });
    }
  }

  disconnect() {}
}

const { currentSocketRef, toastError } = vi.hoisted(() => ({
  currentSocketRef: { current: null as FakeSocket | null },
  toastError: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new (class extends FakeSocket {})();
    currentSocketRef.current = socket;
    return socket;
  },
}));

vi.mock('@/lib/chat/chatSound', () => ({
  playChatMessageSentSound: vi.fn(),
  playChatMessageReceivedSound: vi.fn(),
  unlockChatSounds: vi.fn(),
}));

vi.mock('@/lib/utils/api', () => ({
  apiGet: vi.fn(async () => ({ messages: [], peerReadSequence: 0 })),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));

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

describe('ChatConversation — autorisation microphone', () => {
  afterEach(() => {
    cleanup();
    currentSocketRef.current = null;
    toastError.mockClear();
    vi.unstubAllGlobals();
  });

  it('demande getUserMedia au clic micro pour ouvrir le prompt d’autorisation', async () => {
    stubMatchMedia();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }],
    }));
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {}
      stop() {
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    render(<ChatConversation roomId="room-1" title="Test" />);
    await waitFor(() => expect(currentSocketRef.current).not.toBeNull());

    fireEvent.click(await screen.findByLabelText('Enregistrer un message vocal'));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
    expect(toastError).not.toHaveBeenCalled();
  });
});
