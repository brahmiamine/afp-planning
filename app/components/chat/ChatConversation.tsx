'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Circle, Send } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiGet, apiPatch } from '@/lib/utils/api';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  roomId: string;
  senderUserId: number;
  senderName: string;
  clientMessageId: string;
  sequence: number;
  content: string;
  createdAt: string;
}

interface PendingCommand {
  roomId: string;
  clientMessageId: string;
  content: string;
}

interface ChatResult<T> {
  ok: boolean;
  error?: string;
  messages?: ChatMessage[];
  message?: T;
}

interface ChatConversationProps {
  roomId: string;
  title: string;
  description?: string | null;
  compact?: boolean;
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) => a.sequence - b.sequence);
}

export function ChatConversation({ roomId, title, description, compact = false }: ChatConversationProps) {
  const { user } = useCurrentUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const pendingRef = useRef(new Map<string, PendingCommand>());
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const applyMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const merged = mergeMessages(current, incoming);
      messagesRef.current = merged;
      return merged;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    messagesRef.current = [];
    pendingRef.current.clear();
    setPendingCount(0);

    void apiGet<{ messages: ChatMessage[] }>(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages`)
      .then((result) => {
        if (!cancelled) applyMessages(result.messages);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Chargement impossible');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const sendPending = (command: PendingCommand) => {
      if (!socket.connected) return;
      socket.emit('chat:send', command, (result: ChatResult<ChatMessage>) => {
        if (!result.ok || !result.message) {
          setError(result.error ?? 'Envoi impossible');
          return;
        }
        pendingRef.current.delete(command.clientMessageId);
        setPendingCount(pendingRef.current.size);
        setError(null);
        applyMessages([result.message]);
      });
    };

    const resumeFrom = (afterSequence: number) => {
      socket.emit('chat:resume', { roomId, afterSequence }, (result: ChatResult<never>) => {
        if (!result.ok) {
          setError(result.error ?? 'Reconnexion impossible');
          return;
        }
        const resumed = result.messages ?? [];
        applyMessages(resumed);
        const nextSequence = resumed.at(-1)?.sequence ?? afterSequence;
        if (resumed.length === 200 && nextSequence > afterSequence) resumeFrom(nextSequence);
      });
    };

    socket.on('connect', () => {
      setConnected(true);
      const lastSequence = messagesRef.current.at(-1)?.sequence ?? 0;
      resumeFrom(lastSequence);
      for (const command of pendingRef.current.values()) sendPending(command);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (socketError) => setError(socketError.message || 'Connexion temps réel impossible'));
    socket.on('chat:message', (message: ChatMessage) => {
      if (message.roomId === roomId) applyMessages([message]);
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyMessages, roomId]);

  const lastSequence = messages.at(-1)?.sequence ?? 0;
  useEffect(() => {
    if (!lastSequence) return;
    const timeout = window.setTimeout(() => {
      void apiPatch(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages`, { sequence: lastSequence }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [lastSequence, roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const groupedDate = useMemo(
    () => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }),
    [],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = content.trim();
    if (!normalized || normalized.length > 4_000) return;
    const command = { roomId, clientMessageId: crypto.randomUUID(), content: normalized };
    pendingRef.current.set(command.clientMessageId, command);
    setPendingCount(pendingRef.current.size);
    setContent('');
    setError(null);
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit('chat:send', command, (result: ChatResult<ChatMessage>) => {
      if (!result.ok || !result.message) {
        setError(result.error ?? 'Envoi impossible');
        return;
      }
      pendingRef.current.delete(command.clientMessageId);
      setPendingCount(pendingRef.current.size);
      applyMessages([result.message]);
    });
  };

  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm', compact ? 'h-[34rem]' : 'h-[calc(100dvh-12rem)] min-h-[32rem]')} aria-label={`Discussion ${title}`}>
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><h2 className="truncate font-semibold">{title}</h2>{description && <p className="truncate text-xs text-muted-foreground">{description}</p>}</div>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><Circle className={cn('h-2.5 w-2.5 fill-current', connected ? 'text-emerald-500' : 'text-amber-500')} />{connected ? 'En ligne' : 'Reconnexion…'}</span>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {loading ? <LoadingSpinner text="Chargement des messages…" className="py-12" /> : messages.length === 0 ? <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">Aucun message. Commencez la discussion.</div> : messages.map((message) => {
          const mine = message.senderUserId === user?.id;
          return <article key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted')}><p className={cn('mb-0.5 text-[11px] font-medium', mine ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{mine ? 'Vous' : message.senderName}</p><p className="whitespace-pre-wrap break-words">{message.content}</p><time className={cn('mt-1 block text-[10px]', mine ? 'text-primary-foreground/65' : 'text-muted-foreground')} dateTime={message.createdAt}>{groupedDate.format(new Date(message.createdAt))}</time></div></article>;
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="border-t p-3">
        {error && <p className="mb-2 text-xs text-destructive" role="alert">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={4_000} rows={1} className="max-h-32 min-h-10 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Écrire un message…" aria-label="Message" />
          <Button type="submit" size="icon" disabled={!content.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></Button>
        </div>
        {!connected && pendingCount > 0 && <p className="mt-1 text-xs text-muted-foreground">Le message sera envoyé automatiquement après reconnexion.</p>}
      </form>
    </section>
  );
}
