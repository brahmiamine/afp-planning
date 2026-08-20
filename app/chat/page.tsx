'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Hash, MessageCircle, Plus, Search, UserRound } from 'lucide-react';
import { Header } from '@/app/components/layout/Header';
import { ChatConversation } from '@/app/components/chat/ChatConversation';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/utils/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ChatUser { id: number; nom: string; roles: string[]; }
interface ChatMessage { content: string; senderName: string; createdAt: string; }
interface ChatRoom {
  id: string;
  type: 'direct' | 'event' | 'channel';
  name: string;
  description: string | null;
  eventType: string | null;
  eventId: string | null;
  participants: ChatUser[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
  canManage: boolean;
}
interface ChatEvent { eventType: string; eventId: string; title: string; date: string; time: string; location: string | null; planningStatus: string; }

export default function ChatPage() {
  const { user } = useCurrentUser();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [directOpen, setDirectOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChatRoom | null>(null);
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [participantIds, setParticipantIds] = useState<Set<number>>(new Set());

  const refreshRooms = useCallback(async (selectId?: string) => {
    const result = await apiGet<{ rooms: ChatRoom[] }>('/api/chat/rooms');
    setRooms(result.rooms);
    setSelectedRoomId((current) => selectId ?? current ?? result.rooms[0]?.id ?? null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roomResult, userResult, eventResult] = await Promise.all([
        apiGet<{ rooms: ChatRoom[] }>('/api/chat/rooms'),
        apiGet<{ users: ChatUser[] }>('/api/chat/users'),
        apiGet<{ events: ChatEvent[] }>('/api/chat/events'),
      ]);
      setRooms(roomResult.rooms);
      setUsers(userResult.users);
      setEvents(eventResult.events);
      setSelectedRoomId((current) => current ?? roomResult.rooms[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger le chat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const filteredRooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? rooms.filter((room) => `${room.name} ${room.description ?? ''}`.toLowerCase().includes(normalized)) : rooms;
  }, [query, rooms]);
  const directUsers = users.filter((item) => item.id !== user?.id);

  const createDirect = async (targetUserId: number) => {
    try {
      const result = await apiPost<{ room: { id: string } }>('/api/chat/direct', { userId: targetUserId });
      await refreshRooms(result.room.id);
      setDirectOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Conversation impossible'); }
  };

  const openEvent = async (item: ChatEvent) => {
    try {
      const result = await apiPost<{ room: { id: string } }>('/api/chat/events', item);
      await refreshRooms(result.room.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Chat événement impossible'); }
  };

  const newChannel = () => {
    setEditingChannel(null);
    setChannelName('');
    setChannelDescription('');
    setParticipantIds(new Set(user ? [user.id] : []));
    setChannelOpen(true);
  };

  const editChannel = (room: ChatRoom) => {
    setEditingChannel(room);
    setChannelName(room.name);
    setChannelDescription(room.description ?? '');
    setParticipantIds(new Set(room.participants.map((participant) => participant.id)));
    setChannelOpen(true);
  };

  const saveChannel = async () => {
    try {
      const body = { name: channelName, description: channelDescription, participantUserIds: Array.from(participantIds) };
      if (editingChannel) {
        await apiPatch(`/api/chat/channels/${encodeURIComponent(editingChannel.id)}`, body);
        await refreshRooms(editingChannel.id);
      } else {
        const result = await apiPost<{ room: { id: string } }>('/api/chat/channels', body);
        await refreshRooms(result.room.id);
      }
      setChannelOpen(false);
      toast.success(editingChannel ? 'Canal mis à jour' : 'Canal créé');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Enregistrement impossible'); }
  };

  const archiveSelectedChannel = async () => {
    if (!editingChannel) return;
    try {
      await apiDelete(`/api/chat/channels/${encodeURIComponent(editingChannel.id)}`);
      setChannelOpen(false);
      setSelectedRoomId(null);
      await refreshRooms();
      toast.success('Canal archivé');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Archivage impossible'); }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={load} />
      <main className="container mx-auto max-w-7xl px-3 py-5 sm:px-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="flex items-center gap-2 text-2xl font-bold"><MessageCircle className="h-6 w-6" /> Discussions</h1><p className="text-sm text-muted-foreground">Messages privés, événements et canaux du club.</p></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => setDirectOpen(true)}><UserRound className="mr-2 h-4 w-4" /> Nouveau message</Button>{user?.roles.includes('superadmin') && <Button onClick={newChannel}><Plus className="mr-2 h-4 w-4" /> Nouveau canal</Button>}</div>
        </div>

        {loading ? <LoadingSpinner text="Chargement des discussions…" className="py-20" /> : <div className="grid gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card className="gap-3 py-4">
              <CardHeader className="px-4"><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
              <CardContent className="space-y-2 px-4">
                <label className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm" placeholder="Rechercher…" /></label>
                <div className="max-h-[25rem] space-y-1 overflow-y-auto">
                  {filteredRooms.map((room) => <button type="button" key={room.id} onClick={() => setSelectedRoomId(room.id)} className={cn('w-full rounded-lg border px-3 py-2 text-left transition-colors', selectedRoomId === room.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted')}><div className="flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">{room.type === 'channel' ? <Hash className="h-4 w-4" /> : room.type === 'event' ? <CalendarDays className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{room.name}</span>{room.unreadCount > 0 && <Badge>{room.unreadCount > 99 ? '99+' : room.unreadCount}</Badge>}</div>{room.lastMessage && <p className="mt-1 truncate pl-9 text-xs text-muted-foreground">{room.lastMessage.senderName}: {room.lastMessage.content}</p>}</button>)}
                  {filteredRooms.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">Aucune conversation.</p>}
                </div>
              </CardContent>
            </Card>
            <Card className="gap-3 py-4">
              <CardHeader className="px-4"><CardTitle className="text-base">Événements du club</CardTitle></CardHeader>
              <CardContent className="max-h-64 space-y-1 overflow-y-auto px-4">{events.slice(0, 30).map((item) => <button type="button" key={`${item.eventType}:${item.eventId}`} onClick={() => void openEvent(item)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-muted"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.date} {item.time}</p></button>)}</CardContent>
            </Card>
          </aside>

          {selectedRoom ? <div className="min-w-0"><div className="mb-2 flex justify-end">{selectedRoom.canManage && <Button size="sm" variant="outline" onClick={() => editChannel(selectedRoom)}>Gérer le canal</Button>}</div><ChatConversation roomId={selectedRoom.id} title={selectedRoom.name} description={selectedRoom.description} /></div> : <Card className="flex min-h-[32rem] items-center justify-center"><CardContent className="text-center text-sm text-muted-foreground"><MessageCircle className="mx-auto mb-3 h-10 w-10" />Sélectionnez une conversation ou créez-en une.</CardContent></Card>}
        </div>}
      </main>

      <Dialog open={directOpen} onOpenChange={setDirectOpen}><DialogContent><DialogHeader><DialogTitle>Nouvelle conversation privée</DialogTitle><DialogDescription>Seuls vous et le destinataire pourrez lire les messages.</DialogDescription></DialogHeader><div className="max-h-80 space-y-1 overflow-y-auto">{directUsers.map((item) => <button type="button" key={item.id} onClick={() => void createDirect(item.id)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted"><span>{item.nom}</span><span className="text-xs text-muted-foreground">{item.roles.join(', ')}</span></button>)}</div></DialogContent></Dialog>

      <Dialog open={channelOpen} onOpenChange={setChannelOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{editingChannel ? 'Gérer le canal' : 'Créer un canal'}</DialogTitle><DialogDescription>Choisissez précisément les comptes autorisés. Vous restez automatiquement participant.</DialogDescription></DialogHeader><div className="space-y-3"><input value={channelName} onChange={(event) => setChannelName(event.target.value)} maxLength={100} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Nom du canal" /><textarea value={channelDescription} onChange={(event) => setChannelDescription(event.target.value)} maxLength={500} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Description (optionnelle)" /><fieldset><legend className="mb-2 text-sm font-medium">Participants</legend><div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">{users.map((item) => { const locked = item.id === user?.id; const checked = participantIds.has(item.id); return <label key={item.id} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-muted"><input type="checkbox" checked={checked} disabled={locked} onChange={(event) => setParticipantIds((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /><span className="flex-1 text-sm">{item.nom}</span><span className="text-xs text-muted-foreground">{item.roles.join(', ')}</span></label>; })}</div></fieldset></div><DialogFooter className="sm:justify-between">{editingChannel && <Button variant="destructive" onClick={() => void archiveSelectedChannel()}>Archiver</Button>}<div className="flex gap-2"><Button variant="outline" onClick={() => setChannelOpen(false)}>Annuler</Button><Button onClick={() => void saveChannel()} disabled={channelName.trim().length < 2}>Enregistrer</Button></div></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
