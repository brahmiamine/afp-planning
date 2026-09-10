import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachChatSocketServer } from './socket-server';

const ORIGINAL_VALUE = process.env.CHAT_INSTANCE_COUNT;

describe('attachChatSocketServer — garde-fou multi-instances (issue #258 / #352)', () => {
  afterEach(() => {
    if (ORIGINAL_VALUE === undefined) delete process.env.CHAT_INSTANCE_COUNT;
    else process.env.CHAT_INSTANCE_COUNT = ORIGINAL_VALUE;
  });

  it('warns at startup when CHAT_INSTANCE_COUNT is greater than 1', () => {
    process.env.CHAT_INSTANCE_COUNT = '3';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const httpServer = createServer();
    const handle = attachChatSocketServer(httpServer);
    try {
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CHAT_INSTANCE_COUNT=3'));
    } finally {
      handle.stopSessionRevocationListener();
      handle.io.close();
      warnSpy.mockRestore();
    }
  });

  it('does not warn when CHAT_INSTANCE_COUNT is unset (mono-instance default)', () => {
    delete process.env.CHAT_INSTANCE_COUNT;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const httpServer = createServer();
    const handle = attachChatSocketServer(httpServer);
    try {
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      handle.stopSessionRevocationListener();
      handle.io.close();
      warnSpy.mockRestore();
    }
  });

  it('does not warn when CHAT_INSTANCE_COUNT is 1', () => {
    process.env.CHAT_INSTANCE_COUNT = '1';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const httpServer = createServer();
    const handle = attachChatSocketServer(httpServer);
    try {
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      handle.stopSessionRevocationListener();
      handle.io.close();
      warnSpy.mockRestore();
    }
  });
});
