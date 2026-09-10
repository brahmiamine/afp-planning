// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/api', () => ({ apiGet: apiGetMock }));

class FakeAudio {
  static instances: FakeAudio[] = [];
  volume = 1;
  played = false;
  constructor(public readonly src: string) {
    FakeAudio.instances.push(this);
  }
  play() {
    this.played = true;
    return Promise.resolve();
  }
}

async function freshModule() {
  vi.resetModules();
  FakeAudio.instances.length = 0;
  apiGetMock.mockReset();
  apiGetMock.mockResolvedValue({ preferences: { chatSounds: true } });
  (globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio;
  return import('./chatSound');
}

describe('chat sounds (issue #269)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never plays before the first user interaction unlocks audio (autoplay policy)', async () => {
    const { playChatMessageSentSound } = await freshModule();
    playChatMessageSentSound();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('plays the right file for sent vs received once unlocked', async () => {
    const { playChatMessageSentSound, playChatMessageReceivedSound, unlockChatSounds } = await freshModule();
    unlockChatSounds();
    playChatMessageSentSound();
    playChatMessageReceivedSound();
    expect(FakeAudio.instances.map((audio) => audio.src)).toEqual(['/sounds/chat-sent.wav', '/sounds/chat-received.wav']);
    expect(FakeAudio.instances.every((audio) => audio.played)).toBe(true);
  });

  it('never plays twice for the same unlock (subsequent calls are no-ops on the unlock itself)', async () => {
    const { unlockChatSounds } = await freshModule();
    unlockChatSounds();
    unlockChatSounds();
    expect(apiGetMock).toHaveBeenCalledTimes(1);
  });

  it('respects setChatSoundsEnabled(false): no playback even after unlock', async () => {
    const { playChatMessageSentSound, unlockChatSounds, setChatSoundsEnabled } = await freshModule();
    unlockChatSounds();
    setChatSoundsEnabled(false);
    playChatMessageSentSound();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('loads the persisted preference on first unlock and suppresses playback once chatSounds is false', async () => {
    apiGetMock.mockReset();
    apiGetMock.mockResolvedValue({ preferences: { chatSounds: false } });
    vi.resetModules();
    FakeAudio.instances.length = 0;
    (globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio;
    const { playChatMessageSentSound, unlockChatSounds } = await import('./chatSound');

    unlockChatSounds();
    await Promise.resolve();
    await Promise.resolve();
    playChatMessageSentSound();

    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('keeps sounds enabled by default when the preference request fails', async () => {
    apiGetMock.mockReset();
    apiGetMock.mockRejectedValue(new Error('network down'));
    vi.resetModules();
    FakeAudio.instances.length = 0;
    (globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio;
    const { playChatMessageSentSound, unlockChatSounds } = await import('./chatSound');

    unlockChatSounds();
    await Promise.resolve();
    await Promise.resolve();
    playChatMessageSentSound();

    expect(FakeAudio.instances).toHaveLength(1);
  });
});
