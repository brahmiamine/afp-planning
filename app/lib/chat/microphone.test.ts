import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeMicrophoneError, requestMicrophoneStream } from './microphone';

describe('requestMicrophoneStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appelle getUserMedia({ audio: true }) pour déclencher le prompt navigateur', async () => {
    const stream = { id: 'mic' } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await expect(requestMicrophoneStream()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('signale un appareil sans API média plutôt que d’afficher un toast générique', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestMicrophoneStream()).rejects.toMatchObject({ name: 'NotSupportedError' });
  });
});

describe('describeMicrophoneError', () => {
  it('explique un refus après le prompt, pas un micro « inaccessible »', () => {
    const denied = new DOMException('Permission denied', 'NotAllowedError');
    expect(describeMicrophoneError(denied)).toContain('réglages du navigateur');
    expect(describeMicrophoneError(denied)).not.toContain('inaccessible');
  });

  it('distingue l’absence de matériel', () => {
    expect(describeMicrophoneError(new DOMException('No device', 'NotFoundError')))
      .toContain('Aucun microphone');
  });
});
