'use client';

import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  Link2,
  ListChecks,
  MessageCircle,
  Settings,
  SlidersHorizontal,
  UserRound,
  Users,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';
import { useAppSettings } from '@/hooks/useAppSettings';
import { mergeClubWithSettings } from '@/lib/settings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import { DashboardShell, type DashboardNavSection } from '@/app/components/layout/DashboardShell';

export default function ClubLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, reload } = useCurrentUser();
  const { settings } = useAppSettings();
  const club = mergeClubWithSettings(undefined, settings);
  const { unread } = useUnreadNotificationsCount();

  const handleLogout = async () => {
    try {
      await apiPost('/api/auth/logout');
      toast.success('Déconnexion réussie');
      await reload();
      router.push('/login');
    } catch (error) {
      toast.error('Erreur lors de la déconnexion', { description: error instanceof Error ? error.message : 'Erreur inconnue' });
    }
  };

  const sections: DashboardNavSection[] = [
    {
      items: [
        { href: '/club', label: 'Dashboard', icon: LayoutDashboard, exact: true },
        { href: '/club/evenements', label: 'Événements & week-end', icon: CalendarDays },
      ],
    },
    {
      title: 'Planning',
      items: [
        { href: '/club/planning', label: "Vue d'ensemble", icon: Calendar, exact: true },
        { href: '/club/planning/echanges', label: 'Échanges', icon: ArrowLeftRight },
        { href: '/club/planning/controle', label: 'Contrôle', icon: AlertTriangle },
        { href: '/club/planning/charge', label: 'Charge des officiels', icon: BarChart3 },
        { href: '/club/planning/statistiques', label: 'Statistiques', icon: BarChart3 },
        { href: '/club/planning/ressources', label: 'Ressources & transport', icon: Wrench },
        { href: '/club/planning/recurrent', label: 'Planning récurrent', icon: CalendarRange },
        { href: '/club/planning/outils', label: 'Modèles & actions', icon: ListChecks },
        { href: '/club/planning/partage', label: 'Partage public', icon: Link2 },
      ],
    },
    {
      title: 'Terrain',
      items: [
        { href: '/club/disponibilites', label: 'Disponibilités', icon: UsersRound },
        { href: '/club/mon-calendrier', label: 'Mon calendrier', icon: CalendarDays },
      ],
    },
    {
      title: 'Utilisateurs',
      items: [
        { href: '/club/utilisateurs', label: 'Utilisateurs', icon: Users },
      ],
    },
    {
      title: 'Compte',
      items: [
        { href: '/club/chat', label: 'Discussions', icon: MessageCircle },
        { href: '/club/notifications', label: 'Notifications', icon: Bell, badge: unread },
        { href: '/club/parametres-notifications', label: 'Paramètres notifications', icon: SlidersHorizontal },
        { href: '/club/profil', label: 'Mon profil', icon: UserRound },
      ],
    },
    {
      items: [
        { href: '/club/configuration', label: 'Configuration', icon: Settings },
      ],
    },
  ];

  return (
    <DashboardShell
      brandName={club.name}
      brandLogo={club.logo}
      sections={sections}
      userLabel={user?.email}
      onLogout={handleLogout}
    >
      {children}
    </DashboardShell>
  );
}
