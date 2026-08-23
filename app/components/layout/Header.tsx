"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo, useState } from "react";
import { ClubInfo } from "@/types/match";
import { ScraperButton } from "../matches/ScraperButton";
import { ThemeToggle } from "../ui/theme-toggle";
import { ExportButton } from "../ui/export-button";
import { Button } from "../ui/button";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ChevronLeft,
  Download,
  LayoutDashboard,
  Link2,
  ListChecks,
  LogOut,
  Moon,
  MessageCircle,
  MoreVertical,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sun,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { ExportPdfModal } from "../ui/export-pdf-modal";
import { AddEventDialog } from "../ui/add-event-dialog";
import { apiPost } from "@/lib/utils/api";
import { toast } from "sonner";
import { useAppSettings } from "@/hooks/useAppSettings";
import { mergeClubWithSettings } from "@/lib/settings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canEdit, isReadOnlyRole } from "@/lib/auth/roles";
import { useUnreadNotificationsCount } from "@/hooks/useUnreadNotificationsCount";
import { cn } from "@/lib/utils";

interface HeaderProps {
  club?: ClubInfo;
  onScrapeComplete: () => void;
  onEventAdded?: () => void;
}

// Ordre important : du préfixe le plus spécifique au plus générique (le premier match gagne).
const MOBILE_PAGE_TITLES: [string, string][] = [
  ["/club/planning/evenement", "Espace événement"],
  ["/club/planning/echanges", "Validation des échanges"],
  ["/club/planning/week-end", "Planning du week-end"],
  ["/club/planning/statistiques", "Statistiques planning"],
  ["/club/planning/ressources", "Ressources & transport"],
  ["/club/planning/outils", "Outils planning"],
  ["/club/planning/partage", "Partage du planning"],
  ["/club/planning/controle", "Contrôle du planning"],
  ["/club/planning/charge", "Charge des officiels"],
  ["/club/planning/recurrent", "Planning récurrent"],
  ["/club/planning", "Planning"],
  ["/club/evenements", "Événements"],
  ["/club/disponibilites", "Demandes de disponibilité"],
  ["/club/parametres-notifications", "Paramètres notifications"],
  ["/club/utilisateurs/nouveau", "Ajouter un utilisateur"],
  ["/club/utilisateurs", "Modifier l'utilisateur"],
  ["/club/configuration", "Configuration"],
  ["/club/mon-calendrier", "Mon calendrier"],
  ["/club/notifications", "Notifications"],
  ["/club/chat", "Discussions"],
  ["/club/profil", "Mon profil"],
  ["/club", "Dashboard Club"],
  ["/mon-planning/disponibilites", "Demandes de disponibilité"],
  ["/mon-planning/preferences-planning", "Préférences planning"],
  ["/mon-planning/parametres-notifications", "Paramètres notifications"],
  ["/mon-planning/mon-calendrier", "Mon calendrier"],
  ["/mon-planning/mes-echanges", "Mes échanges"],
  ["/mon-planning/mes-indisponibilites", "Mes indisponibilités"],
  ["/mon-planning/notifications", "Notifications"],
  ["/mon-planning/chat", "Discussions"],
  ["/mon-planning/profil", "Mon profil"],
  ["/mon-planning", "Mon planning"],
];

function getMobilePageTitle(pathname: string): string | null {
  const match = MOBILE_PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : null;
}

export const Header = memo(function Header({ club, onScrapeComplete, onEventAdded }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const mobilePageTitle = getMobilePageTitle(pathname);
  const { setTheme } = useTheme();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAddEventDialogOpen, setIsAddEventDialogOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const { settings } = useAppSettings();
  const displayClub = mergeClubWithSettings(club, settings);
  const { user, reload } = useCurrentUser();
  const editable = canEdit(user?.roles);
  const personal = isReadOnlyRole(user?.roles);

  // /club et /mon-planning sont deux espaces séparés : chaque page partagée (chat,
  // notifications, profil, ...) existe en double sous les deux préfixes.
  const base = personal ? "/mon-planning" : "/club";
  const homeHref = personal ? "/mon-planning" : "/club";
  const isHome = pathname === homeHref;
  const isPlanningPage = pathname === "/club/planning";
  const { unread: unreadNotifications } = useUnreadNotificationsCount();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(homeHref);
  };

  const handleAddEventSuccess = () => {
    setIsAddEventDialogOpen(false);
    onEventAdded?.();
  };

  const handleScrape = async () => {
    setIsScraping(true);
    try {
      await apiPost("/api/scraper");
      toast.success("Actualisation réussie", { description: "Les matchs ont été mis à jour avec succès." });
      setTimeout(() => onScrapeComplete(), 1000);
    } catch (error) {
      toast.error("Erreur lors de l'actualisation", { description: error instanceof Error ? error.message : "Erreur inconnue" });
    } finally {
      setIsScraping(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiPost("/api/auth/logout");
      toast.success("Déconnexion réussie");
      await reload();
      router.push("/login");
    } catch (error) {
      toast.error("Erreur lors de la déconnexion", { description: error instanceof Error ? error.message : "Erreur inconnue" });
    }
  };

  const planningMenuItems = [
    ["/club/disponibilites", "Disponibilités", UsersRound],
    ["/club/planning/echanges", "Échanges d’affectations", ArrowLeftRight],
    ["/club/planning/week-end", "Week-end", CalendarDays],
    ["/club/planning/statistiques", "Statistiques", BarChart3],
    ["/club/planning/ressources", "Ressources & transport", Wrench],
    ["/club/planning/outils", "Modèles & actions", ListChecks],
    ["/club/planning/partage", "Partage public", Link2],
    ["/club/planning/controle", "Contrôle du planning", AlertTriangle],
    ["/club/planning/charge", "Charge des officiels", BarChart3],
    ["/club/planning/recurrent", "Planning récurrent", CalendarRange],
  ] as const;

  return (
    <>
      <header className="border-b border-border bg-card lg:shadow-lg">
        <div className="container mx-auto px-3 py-2.5 sm:px-4 sm:py-3 lg:py-6">
          <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center lg:hidden">
              {!isHome ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-ml-2 h-11 w-11 shrink-0"
                    onClick={handleBack}
                    aria-label="Retour"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <h1 className="truncate text-base font-bold text-foreground sm:text-lg">
                    {mobilePageTitle ?? displayClub.name}
                  </h1>
                </>
              ) : (
                <Link href={homeHref} className="flex min-w-0 flex-1 items-center gap-2.5 transition-opacity hover:opacity-80 sm:gap-3">
                  {displayClub.logo && (
                    <Image
                      src={displayClub.logo}
                      alt={displayClub.name}
                      width={64}
                      height={64}
                      className="h-10 w-10 shrink-0 rounded-xl border border-border bg-white object-contain p-0.5 sm:h-12 sm:w-12"
                      unoptimized
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg font-bold text-foreground sm:text-xl">{displayClub.name}</h1>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{displayClub.description}</p>
                  </div>
                </Link>
              )}
            </div>

            <Link href={homeHref} className="hidden min-w-0 flex-1 items-center gap-4 transition-opacity hover:opacity-80 lg:flex">
              {displayClub.logo && (
                <Image
                  src={displayClub.logo}
                  alt={displayClub.name}
                  width={64}
                  height={64}
                  className="h-16 w-16 shrink-0 rounded-xl border border-border bg-white object-contain p-1"
                  unoptimized
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-3xl font-bold text-foreground">{displayClub.name}</h1>
                <p className="mt-1 truncate text-sm text-muted-foreground">{displayClub.description}</p>
              </div>
            </Link>

            <div className="flex items-center gap-1 sm:gap-2 lg:gap-4">
              <div className="lg:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-11 w-11">
                      <MoreVertical className="h-5 w-5" />
                      <span className="sr-only">Menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-1.5rem))]">
                    {personal && <>
                      <DropdownMenuItem onClick={() => router.push("/mon-planning/mes-echanges")}><ArrowLeftRight className="h-4 w-4 mr-2" /> Mes échanges</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push("/mon-planning/mes-indisponibilites")}><CalendarOff className="h-4 w-4 mr-2" /> Mes indisponibilités</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push("/mon-planning/preferences-planning")}><SlidersHorizontal className="h-4 w-4 mr-2" /> Préférences planning</DropdownMenuItem>
                    </>}
                    {editable && <DropdownMenuItem onClick={() => router.push("/club")}><LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard</DropdownMenuItem>}
                    {editable && <DropdownMenuItem onClick={() => router.push("/club/evenements")}><Calendar className="h-4 w-4 mr-2" /> Événements</DropdownMenuItem>}
                    {editable && planningMenuItems.map(([href, label, Icon]) => <DropdownMenuItem key={href} onClick={() => router.push(href)}><Icon className="h-4 w-4 mr-2" /> {label}</DropdownMenuItem>)}
                    {editable && <DropdownMenuItem onClick={() => setIsExportModalOpen(true)}><Download className="h-4 w-4 mr-2" /> Export PDF</DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => router.push(`${base}/parametres-notifications`)}><SlidersHorizontal className="h-4 w-4 mr-2" /> Paramètres notifications</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push(`${base}/notifications`)}><Bell className="h-4 w-4 mr-2" /> Notifications{!!unreadNotifications && <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push(`${base}/chat`)}><MessageCircle className="h-4 w-4 mr-2" /> Discussions</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push(`${base}/profil`)}><UserRound className="h-4 w-4 mr-2" /> Mon profil</DropdownMenuItem>
                    {editable && <DropdownMenuItem onClick={handleScrape} disabled={isScraping}><RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? "animate-spin" : ""}`} />{isScraping ? "Actualisation..." : "Actualiser"}</DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => setTheme("light")}><Sun className="h-4 w-4 mr-2" /> Mode clair</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}><Moon className="h-4 w-4 mr-2" /> Mode sombre</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>Système</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive"><LogOut className="h-4 w-4 mr-2" /> Déconnexion</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="hidden lg:block"><ThemeToggle /></div>
              <div className="hidden items-center gap-1 lg:flex">
                {personal && pathname !== "/mon-planning" && <Link href="/mon-planning"><Button variant="outline" size="sm" className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Mon planning</Button></Link>}
                {editable && pathname !== "/club" && <Link href="/club"><Button variant="outline" size="sm" className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /> Dashboard</Button></Link>}
                {editable && pathname !== "/club/evenements" && <Link href="/club/evenements"><Button variant="outline" size="sm" className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Événements</Button></Link>}
                {editable && !isPlanningPage && <Link href="/club/planning"><Button variant="outline" size="sm" className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Planning</Button></Link>}
                {editable && <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9" title="Outils planning"><MoreVertical className="h-4 w-4" /><span className="sr-only">Outils planning</span></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">{planningMenuItems.map(([href, label, Icon]) => <DropdownMenuItem key={href} onClick={() => router.push(href)}><Icon className="h-4 w-4 mr-2" /> {label}</DropdownMenuItem>)}</DropdownMenuContent>
                </DropdownMenu>}
                {personal && <Link href="/mon-planning/mes-echanges"><Button variant="ghost" size="icon" className="h-9 w-9" title="Mes échanges"><ArrowLeftRight className="h-4 w-4" /><span className="sr-only">Mes échanges</span></Button></Link>}
                {personal && <Link href="/mon-planning/preferences-planning"><Button variant="ghost" size="icon" className="h-9 w-9" title="Préférences planning"><SlidersHorizontal className="h-4 w-4" /><span className="sr-only">Préférences planning</span></Button></Link>}
                {editable && <ExportButton />}
                <Link href={`${base}/notifications`} className="relative"><Button variant="ghost" size="icon" className="h-9 w-9" title="Notifications"><Bell className="h-4 w-4" /><span className="sr-only">Notifications</span>{!!unreadNotifications && <span className={cn('absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full','bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground')}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}</Button></Link>
                <Link href={`${base}/chat`}><Button variant="ghost" size="icon" className="h-9 w-9" title="Discussions"><MessageCircle className="h-4 w-4" /><span className="sr-only">Discussions</span></Button></Link>
                <Link href={`${base}/mon-calendrier`}><Button variant="ghost" size="icon" className="h-9 w-9" title="Mon calendrier"><CalendarDays className="h-4 w-4" /><span className="sr-only">Mon calendrier</span></Button></Link>
                <Link href={`${base}/parametres-notifications`}><Button variant="ghost" size="icon" className="h-9 w-9" title="Paramètres notifications"><SlidersHorizontal className="h-4 w-4" /><span className="sr-only">Paramètres notifications</span></Button></Link>
                <Link href={`${base}/profil`}><Button variant="ghost" size="icon" className="h-9 w-9" title="Mon profil"><UserRound className="h-4 w-4" /><span className="sr-only">Mon profil</span></Button></Link>
                {editable && <ScraperButton onScrapeComplete={onScrapeComplete} />}
                {editable && <Link href="/club/configuration"><Button variant="ghost" size="icon" className="h-9 w-9" title="Configuration"><Settings className="h-4 w-4" /><span className="sr-only">Configuration</span></Button></Link>}
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleLogout} title="Déconnexion"><LogOut className="h-4 w-4" /><span className="sr-only">Déconnexion</span></Button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <ExportPdfModal open={isExportModalOpen} onOpenChange={setIsExportModalOpen} />
      <AddEventDialog open={isAddEventDialogOpen} onClose={() => setIsAddEventDialogOpen(false)} eventType="amical" onSuccess={handleAddEventSuccess} />
    </>
  );
});
