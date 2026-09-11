// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const { socketRef } = vi.hoisted(() => ({
  socketRef: { current: null as { handlers: Map<string, Array<(...args: unknown[]) => void>> } | null },
}));

vi.mock('socket.io-client', () => ({
  io: () => {
    const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    const socket = {
      handlers,
      on: (event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      removeAllListeners: () => handlers.clear(),
      disconnect: vi.fn(),
    };
    socketRef.current = socket;
    return socket;
  },
}));

describe('subscribeInboxRealtime', () => {
  afterEach(async () => {
    socketRef.current = null;
    vi.resetModules();
  });

  it('notifies chat listeners on chat:message and notification listeners on notifications:changed', async () => {
    const { subscribeInboxRealtime } = await import('./useRealtimeInbox');
    const onChat = vi.fn();
    const onNotifs = vi.fn();
    const stopChat = subscribeInboxRealtime('chat', onChat);
    const stopNotifs = subscribeInboxRealtime('notifications', onNotifs);

    const handlers = socketRef.current?.handlers;
    expect(handlers?.has('chat:message')).toBe(true);
    for (const handler of handlers?.get('chat:message') ?? []) handler();
    for (const handler of handlers?.get('notifications:changed') ?? []) handler();

    expect(onChat).toHaveBeenCalledTimes(1);
    expect(onNotifs).toHaveBeenCalledTimes(1);

    stopChat();
    stopNotifs();
  });
});
