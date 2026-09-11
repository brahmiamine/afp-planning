/** Six réactions rapides affichées au survol (web) et dans « Actions du message » (mobile). */
export const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export interface ChatReactionSummary {
  emoji: string;
  count: number;
  userIds: number[];
}

export function isChatReactionEmoji(value: string): value is ChatReactionEmoji {
  return (CHAT_REACTION_EMOJIS as readonly string[]).includes(value);
}

export function toggleReactionSummaries(
  reactions: ChatReactionSummary[],
  emoji: string,
  userId: number,
): ChatReactionSummary[] {
  const byEmoji = new Map(reactions.map((entry) => [entry.emoji, {
    emoji: entry.emoji,
    count: entry.count,
    userIds: [...entry.userIds],
  }]));
  const current = byEmoji.get(emoji) ?? { emoji, count: 0, userIds: [] as number[] };
  if (current.userIds.includes(userId)) {
    current.userIds = current.userIds.filter((id) => id !== userId);
  } else {
    current.userIds.push(userId);
  }
  current.count = current.userIds.length;
  if (current.count === 0) byEmoji.delete(emoji);
  else byEmoji.set(emoji, current);

  return CHAT_REACTION_EMOJIS
    .map((item) => byEmoji.get(item))
    .filter((entry): entry is ChatReactionSummary => Boolean(entry && entry.count > 0));
}
