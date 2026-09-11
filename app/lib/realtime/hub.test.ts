import { describe, expect, it, vi } from 'vitest';
import { emitNotificationsChanged, setRealtimeHub, userRealtimeRoom } from './hub';

describe('realtime hub', () => {
  it('builds a stable per-user room name', () => {
    expect(userRealtimeRoom('us-biot', 42)).toBe('chat:club:us-biot:user:42');
  });

  it('emits notifications:changed to the user room when a hub is registered', () => {
    const emit = vi.fn();
    setRealtimeHub({ to: (room: string) => ({ emit: (event: string) => emit(room, event) }) });

    emitNotificationsChanged('us-biot', 7);

    expect(emit).toHaveBeenCalledWith('chat:club:us-biot:user:7', 'notifications:changed');
    setRealtimeHub(null);
  });

  it('is a no-op when no socket server is attached', () => {
    setRealtimeHub(null);
    expect(() => emitNotificationsChanged('us-biot', 1)).not.toThrow();
  });
});
