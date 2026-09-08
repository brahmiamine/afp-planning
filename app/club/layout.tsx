'use client';

import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarDays,
  CalendarRange,
  History,
  LayoutDashboard,
  Link2,
  Mail,
  MessageCircle,
  Settings,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';
import { apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';
import { useAppSettings } from '@/hooks/useAppSettings';
import { mergeClubWithSettings, type PlanningFeatureFlags } from '@/lib/settings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import { DashboardShell, type DashboardNavSection } from '@/app/components/layout/DashboardShell';

type FeatureNavSection = Omit<DashboardNavSection, 'items'> & {
  items: Array<DashboardNavSection['items'][number] & { feature?: keyof PlanningFeatureFlags }>;
};

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

  const allSections: FeatureNavSection[] = [
    {
      items: [
        { href: '/club', label: 'Événements', icon: LayoutDashboard, exact: true },
      ],
    },
    {
      title: 'Planning',
      items: [
        { href: '/club/planning', label: 'Préparation du planning', icon: Calendar, exact: true },
        { href: '/club/planning/week-end', label: 'Vue week-end', icon: CalendarDays },
        { href: '/club/planning/echanges', label: 'Échanges', icon: ArrowLeftRight, feature: 'assignmentSwaps' },
        { href: '/club/planning/charge', label: 'Charge des officiels', icon: BarChart3 },
        { href: '/club/planning/statistiques', label: 'Statistiques', icon: BarChart3 },
        { href: '/club/planning/recurrent', label: 'Planning récurrent', icon: CalendarRange, feature: 'recurringEvents' },
        { href: '/club/planning/partage', label: 'Partage public', icon: Link2, feature: 'publicSharing' },
        { href: '/club/planning/historique', label: 'Historique lisible', icon: History },
      ],
    },
    {
      title: 'Terrain',
      items: [
        { href: '/club/disponibilites', label: 'Disponibilités', icon: UsersRound },
      ],
    },
    {
      title: 'Utilisateurs',
      items: [
        { href: '/club/utilisateurs', label: 'Utilisateurs', icon: Users, exact: true },
        { href: '/club/invitations', label: 'Invitations', icon: Mail },
      ],
    },
    {
      title: 'Compte',
      items: [
        { href: '/club/chat', label: 'Discussions', icon: MessageCircle },
        { href: '/club/notifications', label: 'Notifications', icon: Bell, badge: unread },
        { href: '/club/profil', label: 'Mon profil', icon: UserRound },
      ],
    },
    {
      items: [
        { href: '/club/configuration', label: 'Configuration', icon: Settings },
      ],
    },
  ];

  const sections: DashboardNavSection[] = allSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.feature || settings.features[item.feature]),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <DashboardShell
      brandName={club.name}
      brandTag={settings.clubAbbreviation}
      brandLogo={club.logo}
      sections={sections}
      userLabel={user?.email}
      onLogout={handleLogout}
    >
      {children}
    </DashboardShell>
  );
}
