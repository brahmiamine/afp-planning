import { describe, expect, it } from 'vitest';
import { CHAT_REACTION_EMOJIS, isChatReactionEmoji, toggleReactionSummaries } from './reactions';

describe('chat reaction emojis', () => {
  it('exposes exactly six quick reactions', () => {
    expect(CHAT_REACTION_EMOJIS).toEqual(['👍', '❤️', '😂', '😮', '😢', '🎉']);
    expect(isChatReactionEmoji('👍')).toBe(true);
    expect(isChatReactionEmoji('🔥')).toBe(false);
  });

  it('adds then removes the current user from a reaction summary', () => {
    const added = toggleReactionSummaries([], '👍', 7);
    expect(added).toEqual([{ emoji: '👍', count: 1, userIds: [7] }]);

    const removed = toggleReactionSummaries(added, '👍', 7);
    expect(removed).toEqual([]);
  });

  it('keeps other users when the current user removes their reaction', () => {
    const next = toggleReactionSummaries(
      [{ emoji: '❤️', count: 2, userIds: [3, 7] }],
      '❤️',
      7,
    );
    expect(next).toEqual([{ emoji: '❤️', count: 1, userIds: [3] }]);
  });
});
