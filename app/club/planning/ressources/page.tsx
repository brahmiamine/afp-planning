'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiDelete, apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

interface ResourceRecord {
  id: string;
  payload: { name: string; type: string; description: string | null; exclusive: boolean; capacity: number | null; location: string | null; lat: number | null; lon: number | null; active: boolean };
}
interface BookingRecord { id: string; eventType: string | null; eventId: string | null; payload: { resourceId: string; quantity: number; note: string | null } }

export default function PlanningResourcesPage() {
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState('terrain');
  const [capacity, setCapacity] = useState('1');
  const [location, setLocation] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [eventType, setEventType] = useState('officiel');
  const [eventId, setEventId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [departurePoint, setDeparturePoint] = useState('');
  const [departureTime, setDepartureTime] = useState('09:00');
  const [seats, setSeats] = useState('4');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resourceData, bookingData] = await Promise.all([
        apiGet<{ resources: ResourceRecord[] }>('/api/planning/resources'),
        apiGet<{ bookings: BookingRecord[] }>('/api/planning/resource-bookings'),
      ]);
      setResources(resourceData.resources);
      setBookings(bookingData.bookings);
      if (!resourceId && resourceData.resources[0]) setResourceId(resourceData.resources[0].id);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Chargement impossible'); }
    finally { setLoading(false); }
  }, [resourceId]);

  useEffect(() => { void load(); }, [load]);

  const createResource = async () => {
    try {
      await apiPost('/api/planning/resources', {
        name, type, exclusive: true, capacity: capacity ? Number(capacity) : null,
        location, lat: lat ? Number(lat) : null, lon: lon ? Number(lon) : null,
      });
      setName(''); toast.success('Ressource créée'); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Création impossible'); }
  };

  const book = async () => {
    try {
      await apiPost('/api/planning/resource-bookings', { eventType, eventId, resourceId, quantity: 1 });
      toast.success('Ressource réservée'); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Réservation impossible'); }
  };

  const saveTransport = async () => {
    try {
      await apiPost('/api/planning/transport', { eventType, eventId, departurePoint, departureTime, seats: Number(seats) });
      toast.success('Transport configuré');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Transport impossible'); }
  };

  return (
    <div className="max-w-6xl space-y-6">
        <div><h2 className="text-2xl font-bold">Ressources & transport</h2><p className="text-sm text-muted-foreground">Terrains, vestiaires, véhicules, matériel, réservations exclusives et covoiturage.</p></div>
        {loading ? <LoadingSpinner text="Chargement..." className="py-12" /> : (
          <>
            <section className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-base">Ajouter une ressource</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
                <input className="rounded-md border bg-background px-3 py-2" placeholder="Nom" value={name} onChange={(event) => setName(event.target.value)} />
                <select className="rounded-md border bg-background px-3 py-2" value={type} onChange={(event) => setType(event.target.value)}><option value="terrain">Terrain</option><option value="vestiaire">Vestiaire</option><option value="vehicule">Véhicule</option><option value="materiel">Matériel</option><option value="autre">Autre</option></select>
                <input type="number" className="rounded-md border bg-background px-3 py-2" placeholder="Capacité" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
                <input className="rounded-md border bg-background px-3 py-2" placeholder="Lieu" value={location} onChange={(event) => setLocation(event.target.value)} />
                <input type="number" step="any" className="rounded-md border bg-background px-3 py-2" placeholder="Latitude" value={lat} onChange={(event) => setLat(event.target.value)} />
                <input type="number" step="any" className="rounded-md border bg-background px-3 py-2" placeholder="Longitude" value={lon} onChange={(event) => setLon(event.target.value)} />
                <Button className="sm:col-span-2" onClick={createResource} disabled={!name.trim()}>Créer</Button>
              </CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Réserver pour un événement</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
                <select className="rounded-md border bg-background px-3 py-2" value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="officiel">Match officiel</option><option value="amical">Match amical</option><option value="entrainement">Entraînement</option><option value="plateau">Plateau</option></select>
                <input className="rounded-md border bg-background px-3 py-2" placeholder="ID événement" value={eventId} onChange={(event) => setEventId(event.target.value)} />
                <select className="rounded-md border bg-background px-3 py-2 sm:col-span-2" value={resourceId} onChange={(event) => setResourceId(event.target.value)}>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.payload.name}</option>)}</select>
                <Button className="sm:col-span-2" onClick={book} disabled={!eventId || !resourceId}>Réserver</Button>
              </CardContent></Card>
            </section>

            <Card><CardHeader><CardTitle className="text-base">Catalogue</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resources.map((resource) => <div key={resource.id} className="rounded-md border p-3"><div className="flex items-center justify-between"><strong>{resource.payload.name}</strong><Badge variant="outline">{resource.payload.type}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{resource.payload.location || 'Sans lieu'} · capacité {resource.payload.capacity ?? '—'} · {resource.payload.exclusive ? 'exclusive' : 'partagée'}</p><Button size="sm" variant="destructive" className="mt-3" onClick={async () => { await apiDelete(`/api/planning/resources?id=${encodeURIComponent(resource.id)}`); await load(); }}>Supprimer</Button></div>)}</CardContent></Card>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-base">Réservations</CardTitle></CardHeader><CardContent className="space-y-2">{bookings.map((booking) => <div key={booking.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>{booking.eventType}:{booking.eventId} · {resources.find((item) => item.id === booking.payload.resourceId)?.payload.name ?? booking.payload.resourceId}</span><Button size="sm" variant="destructive" onClick={async () => { await apiDelete(`/api/planning/resource-bookings?id=${encodeURIComponent(booking.id)}`); await load(); }}>Libérer</Button></div>)}</CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Transport / covoiturage</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><input className="rounded-md border bg-background px-3 py-2" placeholder="Point de départ" value={departurePoint} onChange={(event) => setDeparturePoint(event.target.value)} /><input type="time" className="rounded-md border bg-background px-3 py-2" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} /><input type="number" min={1} max={100} className="rounded-md border bg-background px-3 py-2" value={seats} onChange={(event) => setSeats(event.target.value)} /><p className="text-xs text-muted-foreground">Le type et l’ID d’événement utilisés ci-dessus servent aussi au transport.</p><Button className="sm:col-span-2" onClick={saveTransport} disabled={!eventId || !departurePoint}>Enregistrer le transport</Button></CardContent></Card>
            </section>
          </>
        )}
    </div>
  );
}
