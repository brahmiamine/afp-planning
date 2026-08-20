'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { ChatConversation } from './ChatConversation';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiPost } from '@/lib/utils/api';

interface EventChatPanelProps {
  eventType: string;
  eventId: string;
  title?: string;
}

export function EventChatPanel({ eventType, eventId, title = 'Chat de l’événement' }: EventChatPanelProps) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRoomId(null);
    setError(null);
    void apiPost<{ room: { id: string } }>('/api/chat/events', { eventType, eventId })
      .then((result) => { if (!cancelled) setRoomId(result.room.id); })
      .catch((requestError) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Chat indisponible'); });
    return () => { cancelled = true; };
  }, [eventId, eventType]);

  if (error) return <div className="rounded-xl border bg-card p-5 text-sm text-destructive"><MessageCircle className="mb-2 h-5 w-5" />{error}</div>;
  if (!roomId) return <div className="rounded-xl border bg-card"><LoadingSpinner text="Ouverture du chat…" className="py-12" /></div>;
  return <ChatConversation roomId={roomId} title={title} description="Visible par tous les utilisateurs actifs du club" compact />;
}
