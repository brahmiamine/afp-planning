'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { CalendarDays, Hash, MessageCircle, Plus, Search, UserRound } from 'lucide-react';
import { ChatConversation } from '@/app/components/chat/ChatConversation';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { TeamLogo } from '@/app/components/ui/team-logo';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/utils/api';
import { playChatMessageReceivedSound } from '@/lib/chat/chatSound';
import { cn } from '@/lib/utils';
import { ACCESS_ROLE_LABELS, type ClubAccessRole } from '@/lib/auth/roles';
import { toast } from 'sonner';

interface ChatUser { id: number; nom: string; accessRole: ClubAccessRole; }
interface ChatMessage { content: string; senderName: string; createdAt: string; deletedAt: string | null; }
interface TeamLogoFields {
  localTeam?: string;
  awayTeam?: string;
  localTeamLogo?: string;
  awayTeamLogo?: string;
}
interface ChatRoom extends TeamLogoFields {
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
interface ChatEvent extends TeamLogoFields {
  eventType: string;
  eventId: string;
  title: string;
  date: string;
  time: string;
  location: string | null;
  planningStatus: string;
}
/** Pastille de conversation : logos des deux clubs pour un événement, icône sinon. */
function RoomAvatar({
  type,
  localTeam,
  awayTeam,
  localTeamLogo,
  awayTeamLogo,
  className,
}: TeamLogoFields & { type: ChatRoom['type']; className?: string }) {
  if (type === 'event' && (localTeamLogo || awayTeamLogo || localTeam || awayTeam)) {
    return (
      <span className={cn('flex shrink-0 -space-x-2', className)}>
        <TeamLogo logo={localTeamLogo} name={localTeam ?? ''} size={26} className="h-[26px] w-[26px] border bg-white" />
        <TeamLogo logo={awayTeamLogo} name={awayTeam ?? ''} size={26} className="h-[26px] w-[26px] border bg-white" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        type === 'direct' ? 'bg-secondary text-secondary-foreground' : 'bg-primary-soft text-primary',
        className,
      )}
    >
      {type === 'channel' ? <Hash className="h-5 w-5" /> : type === 'event' ? <CalendarDays className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
    </span>
  );
}

/**
 * Vue unique du chat, partagée entre /club et /mon-planning (issue #93).
 * `refreshKey` permet au wrapper de relancer le chargement (ex. après un scrape).
 */
export function ChatView({ refreshKey = 0 }: { refreshKey?: number }) {
  const { user } = useCurrentUser();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [openingEventKey, setOpeningEventKey] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  // Lu depuis le socket de la liste (issue #269) sans recréer la connexion à chaque
  // changement de conversation : une ref plutôt qu'une dépendance d'effet.
  const selectedRoomIdRef = useRef<string | null>(null);
  useEffect(() => { selectedRoomIdRef.current = selectedRoomId; }, [selectedRoomId]);
  // Sur mobile, l'écran se comporte comme WhatsApp/Messenger : d'abord la liste
  // des conversations, puis la discussion quand on en ouvre une (avec retour).
  // Sur ≥ lg, les deux volets restent affichés côte à côte.
  const [mobilePane, setMobilePane] = useState<'list' | 'chat'>('list');
  const openRoomOnMobile = (roomId: string) => {
    setSelectedRoomId(roomId);
    setMobilePane('chat');
  };
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
      const [roomResult, userResult] = await Promise.all([
        apiGet<{ rooms: ChatRoom[] }>('/api/chat/rooms'),
        apiGet<{ users: ChatUser[] }>('/api/chat/users'),
      ]);
      setRooms(roomResult.rooms);
      setUsers(userResult.users);
      setSelectedRoomId((current) => current ?? roomResult.rooms[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger le chat');
    } finally {
      setLoading(false);
    }
    // Chat des événements optionnel (feature flag) : une erreur ici (désactivé,
    // permissions) ne doit pas empêcher l'affichage du reste de la page.
    try {
      const eventResult = await apiGet<{ events: ChatEvent[] }>('/api/chat/events');
      setEvents(eventResult.events);
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  // Temps réel de la LISTE : un socket en écoute seule rafraîchit les
  // conversations (dernier message, non-lus, ordre) dès qu'un message ou un
  // accusé de lecture arrive, même pour une conversation non ouverte.
  const listRefreshTimer = useRef<number | null>(null);
  useEffect(() => {
    const socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    const scheduleRefresh = () => {
      if (listRefreshTimer.current !== null) window.clearTimeout(listRefreshTimer.current);
      listRefreshTimer.current = window.setTimeout(() => { void refreshRooms(); }, 300);
    };
    const onMessage = (message: { roomId: string; senderUserId: number }) => {
      // Son de réception (issue #269) : seulement pour une conversation qui n'est pas déjà
      // ouverte (elle joue elle-même son propre son) ni pour ses propres messages en écho.
      if (message.senderUserId !== user?.id && message.roomId !== selectedRoomIdRef.current) {
        playChatMessageReceivedSound();
      }
      scheduleRefresh();
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:read', scheduleRefresh);
    // Salons d'événement : le contenu n'est plus diffusé à tout le club (voir #256),
    // seul ce signal léger (sans contenu) l'est encore, pour rafraîchir la liste.
    socket.on('chat:room-touched', scheduleRefresh);
    return () => {
      if (listRefreshTimer.current !== null) window.clearTimeout(listRefreshTimer.current);
      socket.off('chat:message', onMessage);
      socket.off('chat:read', scheduleRefresh);
      socket.off('chat:room-touched', scheduleRefresh);
      socket.disconnect();
    };
  }, [refreshRooms, user?.id]);

  // Mobile : l'écran de chat occupe toute la hauteur (cadre fixe) — on bloque le
  // scroll vertical de la page tant que cette vue est montée.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const apply = () => { document.body.style.overflow = media.matches ? 'hidden' : ''; };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
      document.body.style.overflow = '';
    };
  }, []);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const filteredRooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? rooms.filter((room) => `${room.name} ${room.description ?? ''}`.toLowerCase().includes(normalized)) : rooms;
  }, [query, rooms]);
  const directUsers = users.filter((item) => item.id !== user?.id);
  // Événements publiés n'ayant pas encore de salon dans la liste : une fois ouvert,
  // le salon apparaît normalement dans « Conversations » et disparaît d'ici. Un
  // événement annulé n'est jamais proposé comme démarrable, seul son historique
  // existant (déjà dans « Conversations ») reste accessible.
  const eventsWithoutRoom = useMemo(
    () => events.filter((event) => (
      event.planningStatus !== 'cancelled'
      && !rooms.some((room) => room.eventType === event.eventType && room.eventId === event.eventId)
    )),
    [events, rooms],
  );

  // Jeton de la dernière ouverture demandée : une réponse plus ancienne qui arrive
  // après (course entre deux clics) ne doit ni écraser la sélection la plus récente,
  // ni laisser un bouton bloqué en chargement.
  const openEventRequestRef = useRef(0);

  const openEventChat = async (event: ChatEvent) => {
    const key = `${event.eventType}:${event.eventId}`;
    const requestId = openEventRequestRef.current + 1;
    openEventRequestRef.current = requestId;
    setOpeningEventKey(key);
    try {
      const result = await apiPost<{ room: { id: string } }>('/api/chat/events', { eventType: event.eventType, eventId: event.eventId });
      if (openEventRequestRef.current !== requestId) return;
      await refreshRooms(result.room.id);
      openRoomOnMobile(result.room.id);
    } catch (error) {
      if (openEventRequestRef.current !== requestId) return;
      toast.error(error instanceof Error ? error.message : 'Impossible d’ouvrir ce salon');
    } finally {
      if (openEventRequestRef.current === requestId) setOpeningEventKey(null);
    }
  };

  const createDirect = async (targetUserId: number) => {
    try {
      const result = await apiPost<{ room: { id: string } }>('/api/chat/direct', { userId: targetUserId });
      await refreshRooms(result.room.id);
      setDirectOpen(false);
      setMobilePane('chat');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Conversation impossible'); }
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
    <>
      <div
        className={cn(
          'flex min-h-0 flex-col',
          // Mobile : écran plein-hauteur fixe, aucun scroll de page (comme une messagerie).
          'fixed inset-x-0 top-0 bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] z-30 gap-3 bg-background px-3 pt-3',
          'lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:block lg:gap-0 lg:bg-transparent lg:px-0 lg:pt-0',
        )}
      >
        <div className={cn('flex flex-wrap items-center justify-between gap-2 lg:mb-4 lg:gap-3', mobilePane === 'chat' && 'hidden lg:flex')}>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-bold lg:text-2xl"><MessageCircle className="h-5 w-5 lg:h-6 lg:w-6" /> Discussions</h1>
            <p className="hidden text-sm text-muted-foreground lg:block">Messages privés, événements et canaux du club.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" className="lg:h-9" onClick={() => setDirectOpen(true)}><UserRound className="mr-2 h-4 w-4" /> Nouveau message</Button>
            {user?.accessRole === 'admin' && <Button size="sm" className="lg:h-9" onClick={newChannel}><Plus className="mr-2 h-4 w-4" /> Nouveau canal</Button>}
          </div>
        </div>

        {loading ? <LoadingSpinner text="Chargement des discussions…" className="py-20" /> : <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 lg:flex-none lg:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className={cn('flex min-h-0 min-w-0 flex-col lg:block lg:space-y-4', mobilePane === 'chat' && 'hidden lg:flex')}>
            {eventsWithoutRoom.length > 0 && (
              <Card className="mb-3 max-h-64 shrink-0 gap-3 overflow-hidden py-4 lg:mb-4 lg:max-h-none">
                <CardHeader className="shrink-0 px-4"><CardTitle className="text-base">Événements</CardTitle></CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4">
                  {eventsWithoutRoom.map((event) => {
                    const key = `${event.eventType}:${event.eventId}`;
                    return (
                      <button
                        type="button"
                        key={key}
                        disabled={openingEventKey !== null}
                        onClick={() => void openEventChat(event)}
                        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-secondary-soft disabled:opacity-60"
                      >
                        <RoomAvatar type="event" localTeam={event.localTeam} awayTeam={event.awayTeam} localTeamLogo={event.localTeamLogo} awayTeamLogo={event.awayTeamLogo} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{event.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {[event.date, event.time, event.location].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {openingEventKey === key && <LoadingSpinner size={16} />}
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            )}
            <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden py-4 lg:flex-none">
              <CardHeader className="shrink-0 px-4"><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
              <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-4">
                <label className="relative block shrink-0"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm" placeholder="Rechercher…" /></label>
                <div className="min-h-0 min-w-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden lg:max-h-[25rem] lg:flex-none">
                  {filteredRooms.map((room) => <button type="button" key={room.id} onClick={() => openRoomOnMobile(room.id)} className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors', selectedRoomId === room.id ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-secondary-soft')}><RoomAvatar type={room.type} localTeam={room.localTeam} awayTeam={room.awayTeam} localTeamLogo={room.localTeamLogo} awayTeamLogo={room.awayTeamLogo} /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{room.name}</span>{room.lastMessage && <time className="shrink-0 text-[11px] text-muted-foreground">{new Date(room.lastMessage.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</time>}</span>{room.lastMessage ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{room.lastMessage.deletedAt ? 'Message supprimé' : `${room.lastMessage.senderName}: ${room.lastMessage.content}`}</span> : <span className="mt-0.5 block text-xs text-muted-foreground/70">Aucun message</span>}</span>{room.unreadCount > 0 && <Badge className="shrink-0 self-start">{room.unreadCount > 99 ? '99+' : room.unreadCount}</Badge>}</button>)}
                  {filteredRooms.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">Aucune conversation.</p>}
                </div>
              </CardContent>
            </Card>
          </aside>

          <div
            className={cn(
              'min-w-0',
              mobilePane === 'list' && 'hidden lg:block',
              mobilePane === 'chat'
                && 'fixed inset-x-0 top-0 z-40 bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] flex flex-col lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:block',
            )}
          >
            {selectedRoom ? (
              <>
                {selectedRoom.canManage && (
                  <div className="mb-2 flex justify-end px-3 pt-2 lg:px-0 lg:pt-0">
                    <Button size="sm" variant="outline" onClick={() => editChannel(selectedRoom)}>Gérer le canal</Button>
                  </div>
                )}
                <div className="min-h-0 flex-1 lg:flex-none">
                  <ChatConversation
                    roomId={selectedRoom.id}
                    title={selectedRoom.name}
                    description={selectedRoom.description}
                    avatar={
                      <RoomAvatar
                        type={selectedRoom.type}
                        localTeam={selectedRoom.localTeam}
                        awayTeam={selectedRoom.awayTeam}
                        localTeamLogo={selectedRoom.localTeamLogo}
                        awayTeamLogo={selectedRoom.awayTeamLogo}
                      />
                    }
                    onBack={() => setMobilePane('list')}
                    mentionables={users}
                    fill
                  />
                </div>
              </>
            ) : (
              <Card className="flex min-h-[32rem] items-center justify-center"><CardContent className="text-center text-sm text-muted-foreground"><MessageCircle className="mx-auto mb-3 h-10 w-10" />Sélectionnez une conversation ou créez-en une.</CardContent></Card>
            )}
          </div>
        </div>}
      </div>

      <Dialog open={directOpen} onOpenChange={setDirectOpen}><DialogContent><DialogHeader><DialogTitle>Nouvelle conversation privée</DialogTitle><DialogDescription>Seuls vous et le destinataire pourrez lire les messages.</DialogDescription></DialogHeader><div className="max-h-80 space-y-1 overflow-y-auto">{directUsers.map((item) => <button type="button" key={item.id} onClick={() => void createDirect(item.id)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted"><span>{item.nom}</span><span className="text-xs text-muted-foreground">{ACCESS_ROLE_LABELS[item.accessRole]}</span></button>)}</div></DialogContent></Dialog>

      <Dialog open={channelOpen} onOpenChange={setChannelOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{editingChannel ? 'Gérer le canal' : 'Créer un canal'}</DialogTitle><DialogDescription>Choisissez précisément les comptes autorisés. Vous restez automatiquement participant.</DialogDescription></DialogHeader><div className="space-y-3"><input value={channelName} onChange={(event) => setChannelName(event.target.value)} maxLength={100} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Nom du canal" /><textarea value={channelDescription} onChange={(event) => setChannelDescription(event.target.value)} maxLength={500} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Description (optionnelle)" /><fieldset><legend className="mb-2 text-sm font-medium">Participants</legend><div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">{users.map((item) => { const locked = item.id === user?.id; const checked = participantIds.has(item.id); return <label key={item.id} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-muted"><input type="checkbox" checked={checked} disabled={locked} onChange={(event) => setParticipantIds((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /><span className="flex-1 text-sm">{item.nom}</span><span className="text-xs text-muted-foreground">{ACCESS_ROLE_LABELS[item.accessRole]}</span></label>; })}</div></fieldset></div><DialogFooter className="sm:justify-between">{editingChannel && <Button variant="destructive" onClick={() => void archiveSelectedChannel()}>Archiver</Button>}<div className="flex gap-2"><Button variant="outline" onClick={() => setChannelOpen(false)}>Annuler</Button><Button onClick={() => void saveChannel()} disabled={channelName.trim().length < 2}>Enregistrer</Button></div></DialogFooter></DialogContent></Dialog>
    </>
  );
}
