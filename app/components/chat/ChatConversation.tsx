'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Check, CheckCheck, Circle, Paperclip, Send, Smile, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiGet } from '@/lib/utils/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ChatAttachment {
  type: 'image' | 'video' | 'audio' | 'gif';
  url: string;
  mimeType: string;
  name: string;
  size: number;
}

interface ChatMessage {
  id: string;
  roomId: string;
  senderUserId: number;
  senderName: string;
  clientMessageId: string;
  sequence: number;
  content: string;
  attachment: ChatAttachment | null;
  createdAt: string;
}

interface PendingCommand {
  roomId: string;
  clientMessageId: string;
  content: string;
  attachment: ChatAttachment | null;
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

const EMOJIS = [
  '😀', '😂', '😍', '😅', '😊', '🙂', '😉', '😎', '🤔', '😢',
  '😭', '😡', '👍', '👎', '🙏', '👏', '💪', '🔥', '🎉', '❤️',
  '⚽', '🏆', '🟥', '🟨', '⏱️', '📅', '✅', '❌', '👏', '💯',
];

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) => a.sequence - b.sequence);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function dayLabel(date: Date, formatter: Intl.DateTimeFormat): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Aujourd'hui";
  if (sameDay(date, yesterday)) return 'Hier';
  return formatter.format(date);
}

function AttachmentBubble({ attachment, mine }: { attachment: ChatAttachment; mine: boolean }) {
  if (attachment.type === 'image' || attachment.type === 'gif') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={attachment.url} alt={attachment.name || 'Image'} className="mb-1 max-h-64 w-full rounded-lg object-cover" loading="lazy" />;
  }
  if (attachment.type === 'video') {
    return <video src={attachment.url} controls className="mb-1 max-h-64 w-full rounded-lg" />;
  }
  return (
    <div className={cn('mb-1 flex items-center gap-2 rounded-lg p-2', mine ? 'bg-primary-foreground/10' : 'bg-background/60')}>
      <audio src={attachment.url} controls className="h-9 max-w-full" />
      <span className="text-[10px] opacity-70">{formatBytes(attachment.size)}</span>
    </div>
  );
}

export function ChatConversation({ roomId, title, description, compact = false }: ChatConversationProps) {
  const { user } = useCurrentUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerReadSequence, setPeerReadSequence] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const pendingRef = useRef(new Map<string, PendingCommand>());
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    setPeerReadSequence(0);

    void apiGet<{ messages: ChatMessage[]; peerReadSequence: number }>(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages`)
      .then((result) => {
        if (cancelled) return;
        applyMessages(result.messages);
        setPeerReadSequence(result.peerReadSequence);
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
    socket.on('chat:read', (receipt: { roomId: string; userId: number; sequence: number }) => {
      if (receipt.roomId === roomId && receipt.userId !== user?.id) {
        setPeerReadSequence((current) => Math.max(current, receipt.sequence));
      }
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyMessages, roomId, user?.id]);

  const lastSequence = messages.at(-1)?.sequence ?? 0;
  useEffect(() => {
    if (!lastSequence) return;
    const timeout = window.setTimeout(() => {
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit('chat:read', { roomId, afterSequence: lastSequence }, () => undefined);
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [lastSequence, roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const timeFormatter = useMemo(() => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }), []);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }), []);

  const sendCommand = useCallback((command: PendingCommand) => {
    pendingRef.current.set(command.clientMessageId, command);
    setPendingCount(pendingRef.current.size);
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
  }, [applyMessages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = content.trim();
    if (!normalized && !pendingAttachment) return;
    if (normalized.length > 4_000) return;
    sendCommand({ roomId, clientMessageId: crypto.randomUUID(), content: normalized, attachment: pendingAttachment });
    setContent('');
    setPendingAttachment(null);
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('roomId', roomId);
      body.set('file', file);
      const response = await fetch('/api/chat/upload', { method: 'POST', body, credentials: 'include' });
      const data = await response.json() as { attachment?: ChatAttachment; error?: string };
      if (!response.ok || !data.attachment) throw new Error(data.error ?? "Échec de l'envoi du fichier");
      setPendingAttachment(data.attachment);
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Échec de l'envoi du fichier");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const insertEmoji = (emoji: string) => {
    setContent((current) => `${current}${emoji}`);
    setEmojiOpen(false);
  };

  const groups = useMemo(() => {
    const result: Array<{ label: string; items: ChatMessage[] }> = [];
    for (const message of messages) {
      const label = dayLabel(new Date(message.createdAt), dateFormatter);
      const last = result.at(-1);
      if (last && last.label === label) last.items.push(message);
      else result.push({ label, items: [message] });
    }
    return result;
  }, [messages, dateFormatter]);

  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm', compact ? 'h-[34rem]' : 'h-[calc(100dvh-12rem)] min-h-[32rem]')} aria-label={`Discussion ${title}`}>
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><h2 className="truncate font-semibold">{title}</h2>{description && <p className="truncate text-xs text-muted-foreground">{description}</p>}</div>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><Circle className={cn('h-2.5 w-2.5 fill-current', connected ? 'text-emerald-500' : 'text-amber-500')} />{connected ? 'En ligne' : 'Reconnexion…'}</span>
        </div>
      </header>
      <div className="flex-1 space-y-1 overflow-y-auto p-4" aria-live="polite">
        {loading ? <LoadingSpinner text="Chargement des messages…" className="py-12" /> : messages.length === 0 ? <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">Aucun message. Commencez la discussion.</div> : groups.map((group) => (
          <div key={group.label} className="space-y-3 py-2">
            <div className="sticky top-0 z-10 flex justify-center">
              <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">{group.label}</span>
            </div>
            {group.items.map((message) => {
              const mine = message.senderUserId === user?.id;
              const read = mine && message.sequence <= peerReadSequence;
              return (
                <article key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted')}>
                    <p className={cn('mb-0.5 text-[11px] font-medium', mine ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{mine ? 'Vous' : message.senderName}</p>
                    {message.attachment && <AttachmentBubble attachment={message.attachment} mine={mine} />}
                    {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                    <div className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-primary-foreground/65' : 'text-muted-foreground')}>
                      <time dateTime={message.createdAt}>{timeFormatter.format(new Date(message.createdAt))}</time>
                      {mine && (read ? <CheckCheck className="h-3.5 w-3.5 text-sky-300" /> : <Check className="h-3.5 w-3.5" />)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="border-t p-3">
        {error && <p className="mb-2 text-xs text-destructive" role="alert">{error}</p>}
        {pendingAttachment && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted px-2 py-1.5 text-xs">
            <span className="truncate">{pendingAttachment.name || pendingAttachment.type} · {formatBytes(pendingAttachment.size)}</span>
            <button type="button" onClick={() => setPendingAttachment(null)} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Retirer la pièce jointe"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/*" className="hidden" onChange={(event) => void handleFileSelected(event.target.files?.[0] ?? null)} />
          <Button type="button" variant="ghost" size="icon" disabled={uploading} onClick={() => fileInputRef.current?.click()} aria-label="Joindre un fichier">
            {uploading ? <LoadingSpinner size={16} /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Insérer un emoji"><Smile className="h-4 w-4" /></Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="grid grid-cols-8 gap-1">
                {EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="rounded p-1 text-lg hover:bg-muted" aria-label={`Insérer ${emoji}`}>{emoji}</button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={4_000} rows={1} className="max-h-32 min-h-10 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Écrire un message…" aria-label="Message" />
          <Button type="submit" size="icon" disabled={!content.trim() && !pendingAttachment} aria-label="Envoyer"><Send className="h-4 w-4" /></Button>
        </div>
        {!connected && pendingCount > 0 && <p className="mt-1 text-xs text-muted-foreground">Le message sera envoyé automatiquement après reconnexion.</p>}
      </form>
    </section>
  );
}
