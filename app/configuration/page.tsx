"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "../components/layout/Header";
import { useMatches } from "../hooks/useMatches";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { useOfficiels, type Officiel } from "../hooks/useOfficiels";
import { useEncadrants, type Encadrant } from "../hooks/useEncadrants";
import { useAccompagnateurs, type Accompagnateur } from "../hooks/useAccompagnateurs";
import { useCategories } from "../hooks/useCategories";
import { useClubs, type Club } from "../hooks/useClubs";
import { useStades, type Stade } from "../hooks/useStades";
import { apiPost, apiPut, apiDelete } from "../lib/utils/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, Tag, Building2, MapPin, Phone, Search, X, Palette, Upload } from "lucide-react";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { useAppSettings } from "../hooks/useAppSettings";
import { applyThemeVariables, type ThemeMode } from "../lib/settings";
import {
  formatIndisponibiliteLabel,
  normalizeIndisponibilites,
  toDateKeyFromInput,
  type OfficielIndisponibilite,
  type OfficielIndisponibiliteType,
} from "../lib/utils/officiel-availability";

function parseDateKey(dateKey: string, endOfDay = false): Date | null {
  const match = dateKey.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const year = Number.parseInt(match[3] ?? "", 10);

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }

  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

function parseTimeToMinutes(value?: string): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = Number.parseInt(match[2] ?? "", 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

type OfficielIndispoDisplay = {
  mode: "current" | "next" | null;
  label: string | null;
};

function getOfficielIndispoDisplay(indisponibilites: OfficielIndisponibilite[] | undefined): OfficielIndispoDisplay {
  const now = new Date();
  const rules = normalizeIndisponibilites(indisponibilites);

  const currentRules: Array<{ rule: OfficielIndisponibilite; endAt: Date }> = [];
  const nextRules: Array<{ rule: OfficielIndisponibilite; startAt: Date }> = [];

  for (const rule of rules) {
    if (rule.type === "day-range") {
      const startDateKey = rule.dateStart ?? rule.date;
      const endDateKey = rule.dateEnd ?? rule.dateStart ?? rule.date;
      if (!startDateKey || !endDateKey) {
        continue;
      }

      const startAt = parseDateKey(startDateKey, false);
      const endAt = parseDateKey(endDateKey, true);
      if (!startAt || !endAt) {
        continue;
      }

      if (now >= startAt && now <= endAt) {
        currentRules.push({ rule, endAt });
      } else if (startAt > now) {
        nextRules.push({ rule, startAt });
      }
      continue;
    }

    const dateKey = rule.date ?? rule.dateStart ?? rule.dateEnd;
    if (!dateKey) {
      continue;
    }

    const dayStart = parseDateKey(dateKey, false);
    if (!dayStart) {
      continue;
    }

    const startMinutes = parseTimeToMinutes(rule.startTime) ?? 0;
    const endMinutes = parseTimeToMinutes(rule.endTime) ?? 23 * 60 + 59;

    const startAt = new Date(dayStart);
    startAt.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

    const endAt = new Date(dayStart);
    endAt.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 59, 999);

    if (now >= startAt && now <= endAt) {
      currentRules.push({ rule, endAt });
    } else if (startAt > now) {
      nextRules.push({ rule, startAt });
    }
  }

  if (currentRules.length > 0) {
    currentRules.sort((a, b) => a.endAt.getTime() - b.endAt.getTime());
    const selected = currentRules[0];
    if (!selected) {
      return { mode: null, label: null };
    }
    return {
      mode: "current",
      label: `Indisponible en cours: ${formatIndisponibiliteLabel(selected.rule)}`,
    };
  }

  if (nextRules.length > 0) {
    nextRules.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const selected = nextRules[0];
    if (!selected) {
      return { mode: null, label: null };
    }
    return {
      mode: "next",
      label: `Prochaine indisponibilité: ${formatIndisponibiliteLabel(selected.rule)}`,
    };
  }

  return { mode: null, label: null };
}

export default function ConfigurationPage() {
  const { matchesData } = useMatches();
  const { officiels, isLoading: isLoadingOfficiels, reload: reloadOfficiels } = useOfficiels();
  const { encadrants, isLoading: isLoadingEncadrants, reload: reloadEncadrants } = useEncadrants();
  const { accompagnateurs, isLoading: isLoadingAccompagnateurs, reload: reloadAccompagnateurs } = useAccompagnateurs();
  const { categories, isLoading: isLoadingCategories, reload: reloadCategories } = useCategories();
  const { clubs, isLoading: isLoadingClubs, reload: reloadClubs } = useClubs();
  const { stades, isLoading: isLoadingStades, reload: reloadStades } = useStades();
  const { settings, isLoading: isLoadingSettings, saveSettings, error: settingsError } = useAppSettings();

  // États pour les dialogs
  const [officielDialog, setOfficielDialog] = useState<{ open: boolean; officiel?: Officiel }>({ open: false });
  const [encadrantDialog, setEncadrantDialog] = useState<{ open: boolean; encadrant?: Encadrant }>({ open: false });
  const [accompagnateurDialog, setAccompagnateurDialog] = useState<{ open: boolean; accompagnateur?: Accompagnateur }>({ open: false });
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category?: string }>({ open: false });
  const [clubDialog, setClubDialog] = useState<{ open: boolean; club?: Club }>({ open: false });
  const [stadeDialog, setStadeDialog] = useState<{ open: boolean; stade?: Stade }>({ open: false });

  // États pour les confirmations de suppression
  const [deleteOfficiel, setDeleteOfficiel] = useState<string | null>(null);
  const [deleteEncadrant, setDeleteEncadrant] = useState<string | null>(null);
  const [deleteAccompagnateur, setDeleteAccompagnateur] = useState<string | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<string | null>(null);
  const [deleteClub, setDeleteClub] = useState<string | null>(null);
  const [deleteStade, setDeleteStade] = useState<string | null>(null);

  // États pour les formulaires
  const [officielForm, setOfficielForm] = useState({ nom: "", telephone: "" });
  const [encadrantForm, setEncadrantForm] = useState({ nom: "", telephone: "" });
  const [accompagnateurForm, setAccompagnateurForm] = useState({ nom: "", telephone: "" });
  const [officielIndispoForm, setOfficielIndispoForm] = useState<{
    type: OfficielIndisponibiliteType;
    startDateInput: string;
    endDateInput: string;
    dateInput: string;
    startTime: string;
    endTime: string;
  }>({
    type: "day-range",
    startDateInput: "",
    endDateInput: "",
    dateInput: "",
    startTime: "",
    endTime: "",
  });
  const [officielIndisponibilites, setOfficielIndisponibilites] = useState<OfficielIndisponibilite[]>([]);
  const [encadrantIndisponibilites, setEncadrantIndisponibilites] = useState<OfficielIndisponibilite[]>([]);
  const [accompagnateurIndisponibilites, setAccompagnateurIndisponibilites] = useState<OfficielIndisponibilite[]>([]);
  const [categoryForm, setCategoryForm] = useState({ value: "" });
  const [clubForm, setClubForm] = useState({ nom: "", logo: "" });
  const [stadeForm, setStadeForm] = useState({ nom: "", adresse: "", googleMapsUrl: "" });
  const [brandingForm, setBrandingForm] = useState({
    clubName: "",
    clubDescription: "",
    clubLogo: "",
    matchesUrlKey: "academie-football-paris-18",
    themeMode: "system" as ThemeMode,
    primaryColor: "#1f2937",
    accentColor: "#e5e7eb",
  });
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // États pour les recherches
  const [searchOfficiel, setSearchOfficiel] = useState("");
  const [searchEncadrant, setSearchEncadrant] = useState("");
  const [searchAccompagnateur, setSearchAccompagnateur] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchClub, setSearchClub] = useState("");
  const [searchStade, setSearchStade] = useState("");

  const isLoading =
    isLoadingOfficiels ||
    isLoadingEncadrants ||
    isLoadingAccompagnateurs ||
    isLoadingCategories ||
    isLoadingClubs ||
    isLoadingStades ||
    isLoadingSettings;

  useEffect(() => {
    setBrandingForm({
      clubName: settings.clubName,
      clubDescription: settings.clubDescription,
      clubLogo: settings.clubLogo,
      matchesUrlKey: settings.matchesUrlKey,
      themeMode: settings.themeMode,
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
    });
  }, [settings]);

  // Filtrage des résultats
  const filteredOfficiels = useMemo(() => {
    if (!searchOfficiel.trim()) return officiels;
    const searchLower = searchOfficiel.toLowerCase();
    return officiels.filter((o) => o.nom.toLowerCase().includes(searchLower) || (o.telephone && o.telephone.toLowerCase().includes(searchLower)));
  }, [officiels, searchOfficiel]);

  const filteredEncadrants = useMemo(() => {
    if (!searchEncadrant.trim()) return encadrants;
    const searchLower = searchEncadrant.toLowerCase();
    return encadrants.filter(
      (item) => item.nom.toLowerCase().includes(searchLower) || (item.telephone && item.telephone.toLowerCase().includes(searchLower)),
    );
  }, [encadrants, searchEncadrant]);

  const filteredAccompagnateurs = useMemo(() => {
    if (!searchAccompagnateur.trim()) return accompagnateurs;
    const searchLower = searchAccompagnateur.toLowerCase();
    return accompagnateurs.filter(
      (item) => item.nom.toLowerCase().includes(searchLower) || (item.telephone && item.telephone.toLowerCase().includes(searchLower)),
    );
  }, [accompagnateurs, searchAccompagnateur]);

  const filteredCategories = useMemo(() => {
    if (!searchCategory.trim()) return categories;
    const searchLower = searchCategory.toLowerCase();
    return categories.filter((c) => c.toLowerCase().includes(searchLower));
  }, [categories, searchCategory]);

  const filteredClubs = useMemo(() => {
    if (!searchClub.trim()) return clubs;
    const searchLower = searchClub.toLowerCase();
    return clubs.filter((c) => c.nom.toLowerCase().includes(searchLower));
  }, [clubs, searchClub]);

  const filteredStades = useMemo(() => {
    if (!searchStade.trim()) return stades;
    const searchLower = searchStade.toLowerCase();
    return stades.filter((s) => s.nom.toLowerCase().includes(searchLower) || (s.adresse && s.adresse.toLowerCase().includes(searchLower)));
  }, [stades, searchStade]);

  // Gestion des officiels
  const handleOpenOfficielDialog = (officiel?: Officiel) => {
    if (officiel) {
      setOfficielForm({ nom: officiel.nom, telephone: officiel.telephone || "" });
      setOfficielIndisponibilites(normalizeIndisponibilites(officiel.indisponibilites));
      setOfficielDialog({ open: true, officiel });
    } else {
      setOfficielForm({ nom: "", telephone: "" });
      setOfficielIndisponibilites([]);
      setOfficielDialog({ open: true });
    }
    setOfficielIndispoForm({
      type: "day-range",
      startDateInput: "",
      endDateInput: "",
      dateInput: "",
      startTime: "",
      endTime: "",
    });
  };

  const handleAddOfficielIndisponibilite = () => {
    if (officielIndispoForm.type === "day-range") {
      const dateStart = toDateKeyFromInput(officielIndispoForm.startDateInput);
      const dateEnd = toDateKeyFromInput(officielIndispoForm.endDateInput || officielIndispoForm.startDateInput);

      if (!dateStart || !dateEnd) {
        toast.error("Les dates de début et fin sont requises");
        return;
      }

      const newRule: OfficielIndisponibilite = {
        id: `day-range-${dateStart}-${dateEnd}-${Date.now()}`,
        type: "day-range",
        dateStart,
        dateEnd,
      };

      setOfficielIndisponibilites((prev) => normalizeIndisponibilites([...prev, newRule]));
      setOfficielIndispoForm((prev) => ({ ...prev, startDateInput: "", endDateInput: "" }));
      return;
    }

    const date = toDateKeyFromInput(officielIndispoForm.dateInput);
    if (!date) {
      toast.error("La date du créneau horaire est requise");
      return;
    }

    if (!officielIndispoForm.startTime && !officielIndispoForm.endTime) {
      toast.error("Ajoutez au moins une heure de début ou de fin");
      return;
    }

    const newRule: OfficielIndisponibilite = {
      id: `time-slot-${date}-${officielIndispoForm.startTime || "--"}-${officielIndispoForm.endTime || "--"}-${Date.now()}`,
      type: "time-slot",
      date,
      ...(officielIndispoForm.startTime ? { startTime: officielIndispoForm.startTime } : {}),
      ...(officielIndispoForm.endTime ? { endTime: officielIndispoForm.endTime } : {}),
    };

    setOfficielIndisponibilites((prev) => normalizeIndisponibilites([...prev, newRule]));
    setOfficielIndispoForm((prev) => ({ ...prev, dateInput: "", startTime: "", endTime: "" }));
  };

  const handleRemoveOfficielIndisponibilite = (ruleId: string) => {
    setOfficielIndisponibilites((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const handleSaveOfficiel = async () => {
    try {
      if (!officielForm.nom.trim()) {
        toast.error("Le nom est requis");
        return;
      }

      if (officielDialog.officiel) {
        // Mise à jour
        await apiPut("/api/officiels", {
          oldNom: officielDialog.officiel.nom,
          nom: officielForm.nom,
          telephone: officielForm.telephone || undefined,
          indisponibilites: officielIndisponibilites,
        });
        toast.success("Officiel mis à jour");
      } else {
        // Ajout
        await apiPost("/api/officiels", {
          nom: officielForm.nom,
          telephone: officielForm.telephone || undefined,
          indisponibilites: officielIndisponibilites,
        });
        toast.success("Officiel ajouté");
      }
      setOfficielDialog({ open: false });
      reloadOfficiels();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleDeleteOfficiel = async () => {
    if (!deleteOfficiel) return;
    try {
      await apiDelete(`/api/officiels?nom=${encodeURIComponent(deleteOfficiel)}`);
      toast.success("Officiel supprimé");
      setDeleteOfficiel(null);
      reloadOfficiels();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleOpenEncadrantDialog = (encadrant?: Encadrant) => {
    if (encadrant) {
      setEncadrantForm({ nom: encadrant.nom, telephone: encadrant.telephone || "" });
      setEncadrantIndisponibilites(normalizeIndisponibilites(encadrant.indisponibilites));
      setEncadrantDialog({ open: true, encadrant });
    } else {
      setEncadrantForm({ nom: "", telephone: "" });
      setEncadrantIndisponibilites([]);
      setEncadrantDialog({ open: true });
    }
    setOfficielIndispoForm({
      type: "day-range",
      startDateInput: "",
      endDateInput: "",
      dateInput: "",
      startTime: "",
      endTime: "",
    });
  };

  const handleAddEncadrantIndisponibilite = () => {
    if (officielIndispoForm.type === "day-range") {
      const dateStart = toDateKeyFromInput(officielIndispoForm.startDateInput);
      const dateEnd = toDateKeyFromInput(officielIndispoForm.endDateInput || officielIndispoForm.startDateInput);

      if (!dateStart || !dateEnd) {
        toast.error("Les dates de début et fin sont requises");
        return;
      }

      const newRule: OfficielIndisponibilite = {
        id: `day-range-${dateStart}-${dateEnd}-${Date.now()}`,
        type: "day-range",
        dateStart,
        dateEnd,
      };

      setEncadrantIndisponibilites((prev) => normalizeIndisponibilites([...prev, newRule]));
      setOfficielIndispoForm((prev) => ({ ...prev, startDateInput: "", endDateInput: "" }));
      return;
    }

    const date = toDateKeyFromInput(officielIndispoForm.dateInput);
    if (!date) {
      toast.error("La date du créneau horaire est requise");
      return;
    }

    if (!officielIndispoForm.startTime && !officielIndispoForm.endTime) {
      toast.error("Ajoutez au moins une heure de début ou de fin");
      return;
    }

    const newRule: OfficielIndisponibilite = {
      id: `time-slot-${date}-${officielIndispoForm.startTime || "--"}-${officielIndispoForm.endTime || "--"}-${Date.now()}`,
      type: "time-slot",
      date,
      ...(officielIndispoForm.startTime ? { startTime: officielIndispoForm.startTime } : {}),
      ...(officielIndispoForm.endTime ? { endTime: officielIndispoForm.endTime } : {}),
    };

    setEncadrantIndisponibilites((prev) => normalizeIndisponibilites([...prev, newRule]));
    setOfficielIndispoForm((prev) => ({ ...prev, dateInput: "", startTime: "", endTime: "" }));
  };

  const handleRemoveEncadrantIndisponibilite = (ruleId: string) => {
    setEncadrantIndisponibilites((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const handleSaveEncadrant = async () => {
    try {
      if (!encadrantForm.nom.trim()) {
        toast.error("Le nom est requis");
        return;
      }

      if (encadrantDialog.encadrant) {
        await apiPut("/api/encadrants", {
          oldNom: encadrantDialog.encadrant.nom,
          nom: encadrantForm.nom,
          telephone: encadrantForm.telephone || undefined,
          indisponibilites: encadrantIndisponibilites,
        });
        toast.success("Encadrant mis à jour");
      } else {
        await apiPost("/api/encadrants", {
          nom: encadrantForm.nom,
          telephone: encadrantForm.telephone || undefined,
          indisponibilites: encadrantIndisponibilites,
        });
        toast.success("Encadrant ajouté");
      }
      setEncadrantDialog({ open: false });
      reloadEncadrants();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleDeleteEncadrant = async () => {
    if (!deleteEncadrant) return;
    try {
      await apiDelete(`/api/encadrants?nom=${encodeURIComponent(deleteEncadrant)}`);
      toast.success("Encadrant supprimé");
      setDeleteEncadrant(null);
      reloadEncadrants();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleOpenAccompagnateurDialog = (accompagnateur?: Accompagnateur) => {
    if (accompagnateur) {
      setAccompagnateurForm({ nom: accompagnateur.nom, telephone: accompagnateur.telephone || "" });
      setAccompagnateurIndisponibilites(normalizeIndisponibilites(accompagnateur.indisponibilites));
      setAccompagnateurDialog({ open: true, accompagnateur });
    } else {
      setAccompagnateurForm({ nom: "", telephone: "" });
      setAccompagnateurIndisponibilites([]);
      setAccompagnateurDialog({ open: true });
    }
    setOfficielIndispoForm({
      type: "day-range",
      startDateInput: "",
      endDateInput: "",
      dateInput: "",
      startTime: "",
      endTime: "",
    });
  };

  const handleAddAccompagnateurIndisponibilite = () => {
    if (officielIndispoForm.type === "day-range") {
      const dateStart = toDateKeyFromInput(officielIndispoForm.startDateInput);
      const dateEnd = toDateKeyFromInput(officielIndispoForm.endDateInput || officielIndispoForm.startDateInput);

      if (!dateStart || !dateEnd) {
        toast.error("Les dates de début et fin sont requises");
        return;
      }

      const newRule: OfficielIndisponibilite = {
        id: `day-range-${dateStart}-${dateEnd}-${Date.now()}`,
        type: "day-range",
        dateStart,
        dateEnd,
      };

      setAccompagnateurIndisponibilites((prev) => normalizeIndisponibilites([...prev, newRule]));
      setOfficielIndispoForm((prev) => ({ ...prev, startDateInput: "", endDateInput: "" }));
      return;
    }

    const date = toDateKeyFromInput(officielIndispoForm.dateInput);
    if (!date) {
      toast.error("La date du créneau horaire est requise");
      return;
    }

    if (!officielIndispoForm.startTime && !officielIndispoForm.endTime) {
      toast.error("Ajoutez au moins une heure de début ou de fin");
      return;
    }

    const newRule: OfficielIndisponibilite = {
      id: `time-slot-${date}-${officielIndispoForm.startTime || "--"}-${officielIndispoForm.endTime || "--"}-${Date.now()}`,
      type: "time-slot",
      date,
      ...(officielIndispoForm.startTime ? { startTime: officielIndispoForm.startTime } : {}),
      ...(officielIndispoForm.endTime ? { endTime: officielIndispoForm.endTime } : {}),
    };

    setAccompagnateurIndisponibilites((prev) => normalizeIndisponibilites([...prev, newRule]));
    setOfficielIndispoForm((prev) => ({ ...prev, dateInput: "", startTime: "", endTime: "" }));
  };

  const handleRemoveAccompagnateurIndisponibilite = (ruleId: string) => {
    setAccompagnateurIndisponibilites((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const handleSaveAccompagnateur = async () => {
    try {
      if (!accompagnateurForm.nom.trim()) {
        toast.error("Le nom est requis");
        return;
      }

      if (accompagnateurDialog.accompagnateur) {
        await apiPut("/api/accompagnateurs", {
          oldNom: accompagnateurDialog.accompagnateur.nom,
          nom: accompagnateurForm.nom,
          telephone: accompagnateurForm.telephone || undefined,
          indisponibilites: accompagnateurIndisponibilites,
        });
        toast.success("Accompagnateur mis à jour");
      } else {
        await apiPost("/api/accompagnateurs", {
          nom: accompagnateurForm.nom,
          telephone: accompagnateurForm.telephone || undefined,
          indisponibilites: accompagnateurIndisponibilites,
        });
        toast.success("Accompagnateur ajouté");
      }
      setAccompagnateurDialog({ open: false });
      reloadAccompagnateurs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleDeleteAccompagnateur = async () => {
    if (!deleteAccompagnateur) return;
    try {
      await apiDelete(`/api/accompagnateurs?nom=${encodeURIComponent(deleteAccompagnateur)}`);
      toast.success("Accompagnateur supprimé");
      setDeleteAccompagnateur(null);
      reloadAccompagnateurs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  // Gestion des catégories
  const handleOpenCategoryDialog = (category?: string) => {
    if (category) {
      setCategoryForm({ value: category });
      setCategoryDialog({ open: true, category });
    } else {
      setCategoryForm({ value: "" });
      setCategoryDialog({ open: true });
    }
  };

  const handleSaveCategory = async () => {
    try {
      if (!categoryForm.value.trim()) {
        toast.error("La catégorie est requise");
        return;
      }

      if (categoryDialog.category) {
        // Mise à jour
        await apiPut("/api/categories", {
          oldValue: categoryDialog.category,
          newValue: categoryForm.value,
        });
        toast.success("Catégorie mise à jour");
      } else {
        // Ajout
        await apiPost("/api/categories", {
          value: categoryForm.value,
        });
        toast.success("Catégorie ajoutée");
      }
      setCategoryDialog({ open: false });
      reloadCategories();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategory) return;
    try {
      await apiDelete(`/api/categories?value=${encodeURIComponent(deleteCategory)}`);
      toast.success("Catégorie supprimée");
      setDeleteCategory(null);
      reloadCategories();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  // Gestion des clubs
  const handleOpenClubDialog = (club?: Club) => {
    if (club) {
      setClubForm({ nom: club.nom, logo: club.logo });
      setClubDialog({ open: true, club });
    } else {
      setClubForm({ nom: "", logo: "" });
      setClubDialog({ open: true });
    }
  };

  const handleSaveClub = async () => {
    try {
      if (!clubForm.nom.trim()) {
        toast.error("Le nom est requis");
        return;
      }
      if (!clubForm.logo.trim()) {
        toast.error("Le logo est requis");
        return;
      }

      if (clubDialog.club) {
        // Mise à jour
        await apiPut("/api/clubs", {
          oldNom: clubDialog.club.nom,
          nom: clubForm.nom,
          logo: clubForm.logo,
        });
        toast.success("Club mis à jour");
      } else {
        // Ajout
        await apiPost("/api/clubs", {
          nom: clubForm.nom,
          logo: clubForm.logo,
        });
        toast.success("Club ajouté");
      }
      setClubDialog({ open: false });
      reloadClubs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleDeleteClub = async () => {
    if (!deleteClub) return;
    try {
      await apiDelete(`/api/clubs?nom=${encodeURIComponent(deleteClub)}`);
      toast.success("Club supprimé");
      setDeleteClub(null);
      reloadClubs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  // Gestion des stades
  const handleOpenStadeDialog = (stade?: Stade) => {
    if (stade) {
      setStadeForm({
        nom: stade.nom,
        adresse: stade.adresse || "",
        googleMapsUrl: stade.googleMapsUrl,
      });
      setStadeDialog({ open: true, stade });
    } else {
      setStadeForm({ nom: "", adresse: "", googleMapsUrl: "" });
      setStadeDialog({ open: true });
    }
  };

  const handleSaveStade = async () => {
    try {
      if (!stadeForm.nom.trim()) {
        toast.error("Le nom est requis");
        return;
      }
      if (!stadeForm.googleMapsUrl.trim()) {
        toast.error("L'URL Google Maps est requise");
        return;
      }

      if (stadeDialog.stade) {
        // Mise à jour
        await apiPut("/api/stades", {
          oldNom: stadeDialog.stade.nom,
          nom: stadeForm.nom,
          adresse: stadeForm.adresse || null,
          googleMapsUrl: stadeForm.googleMapsUrl,
        });
        toast.success("Stade mis à jour");
      } else {
        // Ajout
        await apiPost("/api/stades", {
          nom: stadeForm.nom,
          adresse: stadeForm.adresse || null,
          googleMapsUrl: stadeForm.googleMapsUrl,
        });
        toast.success("Stade ajouté");
      }
      setStadeDialog({ open: false });
      reloadStades();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleDeleteStade = async () => {
    if (!deleteStade) return;
    try {
      await apiDelete(`/api/stades?nom=${encodeURIComponent(deleteStade)}`);
      toast.success("Stade supprimé");
      setDeleteStade(null);
      reloadStades();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    }
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image valide");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setBrandingForm((prev) => ({ ...prev, clubLogo: result }));
      }
    };
    reader.onerror = () => {
      toast.error("Impossible de lire le fichier image");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = async () => {
    try {
      if (!brandingForm.clubName.trim()) {
        toast.error("Le nom du club est requis");
        return;
      }

      setIsSavingBranding(true);
      const saved = await saveSettings({
        clubName: brandingForm.clubName,
        clubDescription: brandingForm.clubDescription,
        clubLogo: brandingForm.clubLogo,
        matchesUrlKey: brandingForm.matchesUrlKey,
        themeMode: brandingForm.themeMode,
        primaryColor: brandingForm.primaryColor,
        accentColor: brandingForm.accentColor,
      });

      applyThemeVariables(saved);
      toast.success("Personnalisation enregistrée");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur", { description: errorMessage });
    } finally {
      setIsSavingBranding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header club={matchesData?.club} onScrapeComplete={() => {}} />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Configuration</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gérez la personnalisation, les officiels, catégories, clubs et stades</p>
          {settingsError && <p className="text-sm text-destructive mt-2">Erreur paramètres: {settingsError}</p>}
        </div>

        {isLoading ? (
          <LoadingSpinner size={48} text="Chargement..." className="py-20" />
        ) : (
          <Tabs defaultValue="personnalisation" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-7 mb-6">
              <TabsTrigger value="personnalisation" className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Personnalisation</span>
              </TabsTrigger>
              <TabsTrigger value="officiels" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Officiels</span>
              </TabsTrigger>
              <TabsTrigger value="encadrants" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Encadrants</span>
              </TabsTrigger>
              <TabsTrigger value="accompagnateurs" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Accompagnateurs</span>
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">Catégories</span>
              </TabsTrigger>
              <TabsTrigger value="clubs" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clubs</span>
              </TabsTrigger>
              <TabsTrigger value="stades" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">Stades</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personnalisation">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Personnalisation de l'application
                  </CardTitle>
                  <CardDescription>Choisissez le nom du club, le logo, le thème et les couleurs globales</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="branding-club-name">Nom du club *</Label>
                    <Input
                      id="branding-club-name"
                      value={brandingForm.clubName}
                      onChange={(e) => setBrandingForm((prev) => ({ ...prev, clubName: e.target.value }))}
                      placeholder="Nom du club"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branding-club-description">Description du club</Label>
                    <Input
                      id="branding-club-description"
                      value={brandingForm.clubDescription}
                      onChange={(e) => setBrandingForm((prev) => ({ ...prev, clubDescription: e.target.value }))}
                      placeholder="Description courte"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branding-matches-url-key">Clé `matches_url` (scraping)</Label>
                    <Input
                      id="branding-matches-url-key"
                      value={brandingForm.matchesUrlKey}
                      onChange={(e) => setBrandingForm((prev) => ({ ...prev, matchesUrlKey: e.target.value }))}
                      placeholder="academie-football-paris-18"
                    />
                    <p className="text-xs text-muted-foreground">
                      Utilisée pour générer l&apos;URL du scraper : sportcorico.com/clubs/&lt;matches_url&gt;
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branding-club-logo">Logo du club (upload ou URL)</Label>
                    <Input
                      id="branding-club-logo"
                      value={brandingForm.clubLogo}
                      onChange={(e) => setBrandingForm((prev) => ({ ...prev, clubLogo: e.target.value }))}
                      placeholder="https://... ou data:image/..."
                    />
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        void handleLogoUpload(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Upload className="h-3.5 w-3.5" />
                      Le fichier est converti et sauvegardé dans la base.
                    </p>
                    {brandingForm.clubLogo && (
                      <div className="flex items-center gap-3 pt-1">
                        <img src={brandingForm.clubLogo} alt="Logo du club" className="w-16 h-16 rounded-full object-cover border" />
                        <span className="text-sm text-muted-foreground">Aperçu du logo</span>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="branding-theme-mode">Thème</Label>
                      <select
                        id="branding-theme-mode"
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={brandingForm.themeMode}
                        onChange={(e) => {
                          const value = e.target.value as ThemeMode;
                          setBrandingForm((prev) => ({ ...prev, themeMode: value }));
                        }}
                      >
                        <option value="light">Clair</option>
                        <option value="dark">Sombre</option>
                        <option value="system">Système</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="branding-primary-color">Couleur principale</Label>
                      <Input
                        id="branding-primary-color"
                        type="color"
                        value={brandingForm.primaryColor}
                        onChange={(e) => setBrandingForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
                        className="h-10 p-1"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="branding-accent-color">Couleur secondaire</Label>
                      <Input
                        id="branding-accent-color"
                        type="color"
                        value={brandingForm.accentColor}
                        onChange={(e) => setBrandingForm((prev) => ({ ...prev, accentColor: e.target.value }))}
                        className="h-10 p-1"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveBranding} disabled={isSavingBranding}>
                      {isSavingBranding ? "Enregistrement..." : "Enregistrer la personnalisation"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Section Officiels */}
            <TabsContent value="officiels">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Officiels
                      </CardTitle>
                      <CardDescription>Gérez la liste des officiels et leurs numéros de téléphone</CardDescription>
                    </div>
                    <Button onClick={() => handleOpenOfficielDialog()} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher un officiel..."
                        value={searchOfficiel}
                        onChange={(e) => setSearchOfficiel(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchOfficiel && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchOfficiel("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredOfficiels.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        {searchOfficiel ? "Aucun résultat trouvé" : "Aucun officiel enregistré"}
                      </p>
                    ) : (
                      filteredOfficiels.map((officiel) => {
                        const indispoDisplay = getOfficielIndispoDisplay(officiel.indisponibilites);

                        return (
                          <div
                            key={officiel.nom}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">{officiel.nom}</p>
                              {officiel.telephone && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                  <Phone className="h-3 w-3" />
                                  {officiel.telephone}
                                </p>
                              )}
                              {indispoDisplay.label && (
                                <p className={`text-xs mt-1 ${indispoDisplay.mode === "current" ? "text-destructive" : "text-muted-foreground"}`}>
                                  {indispoDisplay.label}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenOfficielDialog(officiel)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteOfficiel(officiel.nom)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="encadrants">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Encadrants
                      </CardTitle>
                      <CardDescription>Gérez la liste des encadrants et leurs indisponibilités</CardDescription>
                    </div>
                    <Button onClick={() => handleOpenEncadrantDialog()} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher un encadrant..."
                        value={searchEncadrant}
                        onChange={(e) => setSearchEncadrant(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchEncadrant && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchEncadrant("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredEncadrants.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        {searchEncadrant ? "Aucun résultat trouvé" : "Aucun encadrant enregistré"}
                      </p>
                    ) : (
                      filteredEncadrants.map((encadrant) => {
                        const indispoDisplay = getOfficielIndispoDisplay(encadrant.indisponibilites);

                        return (
                          <div
                            key={encadrant.nom}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">{encadrant.nom}</p>
                              {encadrant.telephone && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                  <Phone className="h-3 w-3" />
                                  {encadrant.telephone}
                                </p>
                              )}
                              {indispoDisplay.label && (
                                <p className={`text-xs mt-1 ${indispoDisplay.mode === "current" ? "text-destructive" : "text-muted-foreground"}`}>
                                  {indispoDisplay.label}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenEncadrantDialog(encadrant)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteEncadrant(encadrant.nom)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="accompagnateurs">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Accompagnateurs
                      </CardTitle>
                      <CardDescription>Gérez la liste des accompagnateurs et leurs indisponibilités</CardDescription>
                    </div>
                    <Button onClick={() => handleOpenAccompagnateurDialog()} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher un accompagnateur..."
                        value={searchAccompagnateur}
                        onChange={(e) => setSearchAccompagnateur(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchAccompagnateur && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchAccompagnateur("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredAccompagnateurs.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        {searchAccompagnateur ? "Aucun résultat trouvé" : "Aucun accompagnateur enregistré"}
                      </p>
                    ) : (
                      filteredAccompagnateurs.map((accompagnateur) => {
                        const indispoDisplay = getOfficielIndispoDisplay(accompagnateur.indisponibilites);

                        return (
                          <div
                            key={accompagnateur.nom}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">{accompagnateur.nom}</p>
                              {accompagnateur.telephone && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                  <Phone className="h-3 w-3" />
                                  {accompagnateur.telephone}
                                </p>
                              )}
                              {indispoDisplay.label && (
                                <p className={`text-xs mt-1 ${indispoDisplay.mode === "current" ? "text-destructive" : "text-muted-foreground"}`}>
                                  {indispoDisplay.label}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenAccompagnateurDialog(accompagnateur)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteAccompagnateur(accompagnateur.nom)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Section Catégories */}
            <TabsContent value="categories">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        Catégories
                      </CardTitle>
                      <CardDescription>Gérez les catégories d'âge des équipes</CardDescription>
                    </div>
                    <Button onClick={() => handleOpenCategoryDialog()} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher une catégorie..."
                        value={searchCategory}
                        onChange={(e) => setSearchCategory(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchCategory && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchCategory("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredCategories.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        {searchCategory ? "Aucun résultat trouvé" : "Aucune catégorie enregistrée"}
                      </p>
                    ) : (
                      filteredCategories.map((category) => (
                        <div
                          key={category}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <p className="font-medium text-foreground">{category}</p>
                          <div className="flex items-center gap-2 ml-4">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenCategoryDialog(category)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteCategory(category)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Section Clubs */}
            <TabsContent value="clubs">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Clubs
                      </CardTitle>
                      <CardDescription>Gérez la liste des clubs et leurs logos</CardDescription>
                    </div>
                    <Button onClick={() => handleOpenClubDialog()} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher un club..."
                        value={searchClub}
                        onChange={(e) => setSearchClub(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchClub && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchClub("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredClubs.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">{searchClub ? "Aucun résultat trouvé" : "Aucun club enregistré"}</p>
                    ) : (
                      filteredClubs.map((club) => (
                        <div
                          key={club.nom}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {club.logo && (
                              <img
                                src={club.logo}
                                alt={club.nom}
                                className="w-10 h-10 rounded-full object-cover border shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            )}
                            <p className="font-medium text-foreground truncate">{club.nom}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenClubDialog(club)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteClub(club.nom)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Section Stades */}
            <TabsContent value="stades">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Stades
                      </CardTitle>
                      <CardDescription>Gérez la liste des stades et leurs informations</CardDescription>
                    </div>
                    <Button onClick={() => handleOpenStadeDialog()} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher un stade..."
                        value={searchStade}
                        onChange={(e) => setSearchStade(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchStade && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                          onClick={() => setSearchStade("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredStades.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">{searchStade ? "Aucun résultat trouvé" : "Aucun stade enregistré"}</p>
                    ) : (
                      filteredStades.map((stade) => (
                        <div
                          key={stade.nom}
                          className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground">{stade.nom}</p>
                            {stade.adresse && <p className="text-sm text-muted-foreground mt-1">{stade.adresse}</p>}
                            {stade.googleMapsUrl && (
                              <a
                                href={stade.googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline mt-1 inline-block"
                              >
                                Voir sur Google Maps
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenStadeDialog(stade)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteStade(stade.nom)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Dialog Officiel */}
        <Dialog open={officielDialog.open} onOpenChange={(open) => setOfficielDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{officielDialog.officiel ? "Modifier l'officiel" : "Ajouter un officiel"}</DialogTitle>
              <DialogDescription>
                {officielDialog.officiel ? "Modifiez les informations de l'officiel" : "Ajoutez un nouvel officiel à la liste"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="officiel-nom">Nom *</Label>
                <Input
                  id="officiel-nom"
                  value={officielForm.nom}
                  onChange={(e) => setOfficielForm({ ...officielForm, nom: e.target.value })}
                  placeholder="Nom de l'officiel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="officiel-telephone">Téléphone</Label>
                <Input
                  id="officiel-telephone"
                  value={officielForm.telephone}
                  onChange={(e) => setOfficielForm({ ...officielForm, telephone: e.target.value })}
                  placeholder="06.12.34.56.78"
                />
              </div>

              <div className="space-y-3 border rounded-lg p-3">
                <Label className="text-sm font-semibold">Indisponibilités</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="officiel-indispo-type">Type</Label>
                    <select
                      id="officiel-indispo-type"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={officielIndispoForm.type}
                      onChange={(e) => {
                        const value = e.target.value as OfficielIndisponibiliteType;
                        setOfficielIndispoForm((prev) => ({ ...prev, type: value }));
                      }}
                    >
                      <option value="day-range">Plage de jours</option>
                      <option value="time-slot">Plage horaire (1 jour)</option>
                    </select>
                  </div>

                  {officielIndispoForm.type === "day-range" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="officiel-indispo-start-date">Date début</Label>
                        <Input
                          id="officiel-indispo-start-date"
                          type="date"
                          value={officielIndispoForm.startDateInput}
                          onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, startDateInput: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="officiel-indispo-end-date">Date fin</Label>
                        <Input
                          id="officiel-indispo-end-date"
                          type="date"
                          value={officielIndispoForm.endDateInput}
                          onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, endDateInput: e.target.value }))}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="officiel-indispo-date">Date</Label>
                      <Input
                        id="officiel-indispo-date"
                        type="date"
                        value={officielIndispoForm.dateInput}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, dateInput: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                {officielIndispoForm.type === "time-slot" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="officiel-indispo-start">Début</Label>
                      <Input
                        id="officiel-indispo-start"
                        type="time"
                        value={officielIndispoForm.startTime}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="officiel-indispo-end">Fin</Label>
                      <Input
                        id="officiel-indispo-end"
                        type="time"
                        value={officielIndispoForm.endTime}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={handleAddOfficielIndisponibilite}>
                    Ajouter l'indisponibilité
                  </Button>
                </div>

                {officielIndisponibilites.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune indisponibilité enregistrée.</p>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {officielIndisponibilites.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                        <span>{formatIndisponibiliteLabel(rule)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveOfficielIndisponibilite(rule.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOfficielDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveOfficiel}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={encadrantDialog.open} onOpenChange={(open) => setEncadrantDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{encadrantDialog.encadrant ? "Modifier l'encadrant" : "Ajouter un encadrant"}</DialogTitle>
              <DialogDescription>
                {encadrantDialog.encadrant ? "Modifiez les informations de l'encadrant" : "Ajoutez un nouvel encadrant à la liste"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="encadrant-nom">Nom *</Label>
                <Input
                  id="encadrant-nom"
                  value={encadrantForm.nom}
                  onChange={(e) => setEncadrantForm({ ...encadrantForm, nom: e.target.value })}
                  placeholder="Nom de l'encadrant"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="encadrant-telephone">Téléphone</Label>
                <Input
                  id="encadrant-telephone"
                  value={encadrantForm.telephone}
                  onChange={(e) => setEncadrantForm({ ...encadrantForm, telephone: e.target.value })}
                  placeholder="06.12.34.56.78"
                />
              </div>

              <div className="space-y-3 border rounded-lg p-3">
                <Label className="text-sm font-semibold">Indisponibilités</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="encadrant-indispo-type">Type</Label>
                    <select
                      id="encadrant-indispo-type"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={officielIndispoForm.type}
                      onChange={(e) => {
                        const value = e.target.value as OfficielIndisponibiliteType;
                        setOfficielIndispoForm((prev) => ({ ...prev, type: value }));
                      }}
                    >
                      <option value="day-range">Plage de jours</option>
                      <option value="time-slot">Plage horaire (1 jour)</option>
                    </select>
                  </div>

                  {officielIndispoForm.type === "day-range" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="encadrant-indispo-start-date">Date début</Label>
                        <Input
                          id="encadrant-indispo-start-date"
                          type="date"
                          value={officielIndispoForm.startDateInput}
                          onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, startDateInput: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="encadrant-indispo-end-date">Date fin</Label>
                        <Input
                          id="encadrant-indispo-end-date"
                          type="date"
                          value={officielIndispoForm.endDateInput}
                          onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, endDateInput: e.target.value }))}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="encadrant-indispo-date">Date</Label>
                      <Input
                        id="encadrant-indispo-date"
                        type="date"
                        value={officielIndispoForm.dateInput}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, dateInput: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                {officielIndispoForm.type === "time-slot" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="encadrant-indispo-start">Début</Label>
                      <Input
                        id="encadrant-indispo-start"
                        type="time"
                        value={officielIndispoForm.startTime}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="encadrant-indispo-end">Fin</Label>
                      <Input
                        id="encadrant-indispo-end"
                        type="time"
                        value={officielIndispoForm.endTime}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={handleAddEncadrantIndisponibilite}>
                    Ajouter l'indisponibilité
                  </Button>
                </div>

                {encadrantIndisponibilites.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune indisponibilité enregistrée.</p>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {encadrantIndisponibilites.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                        <span>{formatIndisponibiliteLabel(rule)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveEncadrantIndisponibilite(rule.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEncadrantDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveEncadrant}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={accompagnateurDialog.open} onOpenChange={(open) => setAccompagnateurDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{accompagnateurDialog.accompagnateur ? "Modifier l'accompagnateur" : "Ajouter un accompagnateur"}</DialogTitle>
              <DialogDescription>
                {accompagnateurDialog.accompagnateur
                  ? "Modifiez les informations de l'accompagnateur"
                  : "Ajoutez un nouvel accompagnateur à la liste"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="accompagnateur-nom">Nom *</Label>
                <Input
                  id="accompagnateur-nom"
                  value={accompagnateurForm.nom}
                  onChange={(e) => setAccompagnateurForm({ ...accompagnateurForm, nom: e.target.value })}
                  placeholder="Nom de l'accompagnateur"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accompagnateur-telephone">Téléphone</Label>
                <Input
                  id="accompagnateur-telephone"
                  value={accompagnateurForm.telephone}
                  onChange={(e) => setAccompagnateurForm({ ...accompagnateurForm, telephone: e.target.value })}
                  placeholder="06.12.34.56.78"
                />
              </div>

              <div className="space-y-3 border rounded-lg p-3">
                <Label className="text-sm font-semibold">Indisponibilités</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="accompagnateur-indispo-type">Type</Label>
                    <select
                      id="accompagnateur-indispo-type"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={officielIndispoForm.type}
                      onChange={(e) => {
                        const value = e.target.value as OfficielIndisponibiliteType;
                        setOfficielIndispoForm((prev) => ({ ...prev, type: value }));
                      }}
                    >
                      <option value="day-range">Plage de jours</option>
                      <option value="time-slot">Plage horaire (1 jour)</option>
                    </select>
                  </div>

                  {officielIndispoForm.type === "day-range" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="accompagnateur-indispo-start-date">Date début</Label>
                        <Input
                          id="accompagnateur-indispo-start-date"
                          type="date"
                          value={officielIndispoForm.startDateInput}
                          onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, startDateInput: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="accompagnateur-indispo-end-date">Date fin</Label>
                        <Input
                          id="accompagnateur-indispo-end-date"
                          type="date"
                          value={officielIndispoForm.endDateInput}
                          onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, endDateInput: e.target.value }))}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="accompagnateur-indispo-date">Date</Label>
                      <Input
                        id="accompagnateur-indispo-date"
                        type="date"
                        value={officielIndispoForm.dateInput}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, dateInput: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                {officielIndispoForm.type === "time-slot" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="accompagnateur-indispo-start">Début</Label>
                      <Input
                        id="accompagnateur-indispo-start"
                        type="time"
                        value={officielIndispoForm.startTime}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accompagnateur-indispo-end">Fin</Label>
                      <Input
                        id="accompagnateur-indispo-end"
                        type="time"
                        value={officielIndispoForm.endTime}
                        onChange={(e) => setOfficielIndispoForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={handleAddAccompagnateurIndisponibilite}>
                    Ajouter l'indisponibilité
                  </Button>
                </div>

                {accompagnateurIndisponibilites.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune indisponibilité enregistrée.</p>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {accompagnateurIndisponibilites.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                        <span>{formatIndisponibiliteLabel(rule)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveAccompagnateurIndisponibilite(rule.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAccompagnateurDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveAccompagnateur}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Catégorie */}
        <Dialog open={categoryDialog.open} onOpenChange={(open) => setCategoryDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{categoryDialog.category ? "Modifier la catégorie" : "Ajouter une catégorie"}</DialogTitle>
              <DialogDescription>
                {categoryDialog.category ? "Modifiez le nom de la catégorie" : "Ajoutez une nouvelle catégorie à la liste"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category-value">Catégorie *</Label>
                <Input
                  id="category-value"
                  value={categoryForm.value}
                  onChange={(e) => setCategoryForm({ value: e.target.value })}
                  placeholder="U10 A"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCategoryDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveCategory}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Club */}
        <Dialog open={clubDialog.open} onOpenChange={(open) => setClubDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{clubDialog.club ? "Modifier le club" : "Ajouter un club"}</DialogTitle>
              <DialogDescription>{clubDialog.club ? "Modifiez les informations du club" : "Ajoutez un nouveau club à la liste"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="club-nom">Nom *</Label>
                <Input
                  id="club-nom"
                  value={clubForm.nom}
                  onChange={(e) => setClubForm({ ...clubForm, nom: e.target.value })}
                  placeholder="Nom du club"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="club-logo">URL du logo *</Label>
                <Input
                  id="club-logo"
                  value={clubForm.logo}
                  onChange={(e) => setClubForm({ ...clubForm, logo: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              {clubForm.logo && (
                <div className="flex items-center gap-2">
                  <img
                    src={clubForm.logo}
                    alt="Preview"
                    className="w-16 h-16 rounded-full object-cover border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Aperçu</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClubDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveClub}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Stade */}
        <Dialog open={stadeDialog.open} onOpenChange={(open) => setStadeDialog({ open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{stadeDialog.stade ? "Modifier le stade" : "Ajouter un stade"}</DialogTitle>
              <DialogDescription>
                {stadeDialog.stade ? "Modifiez les informations du stade" : "Ajoutez un nouveau stade à la liste"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="stade-nom">Nom *</Label>
                <Input
                  id="stade-nom"
                  value={stadeForm.nom}
                  onChange={(e) => setStadeForm({ ...stadeForm, nom: e.target.value })}
                  placeholder="Nom du stade"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stade-adresse">Adresse</Label>
                <Input
                  id="stade-adresse"
                  value={stadeForm.adresse}
                  onChange={(e) => setStadeForm({ ...stadeForm, adresse: e.target.value })}
                  placeholder="2 Rue Jean Cocteau, 75018 Paris"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stade-googlemaps">URL Google Maps *</Label>
                <Input
                  id="stade-googlemaps"
                  value={stadeForm.googleMapsUrl}
                  onChange={(e) => setStadeForm({ ...stadeForm, googleMapsUrl: e.target.value })}
                  placeholder="https://maps.app.goo.gl/..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStadeDialog({ open: false })}>
                Annuler
              </Button>
              <Button onClick={handleSaveStade}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Alert Dialogs pour les suppressions */}
        <AlertDialog open={!!deleteOfficiel} onOpenChange={(open) => !open && setDeleteOfficiel(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer l'officiel ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer l'officiel "{deleteOfficiel}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteOfficiel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteEncadrant} onOpenChange={(open) => !open && setDeleteEncadrant(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer l'encadrant ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer l'encadrant "{deleteEncadrant}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteEncadrant} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteAccompagnateur} onOpenChange={(open) => !open && setDeleteAccompagnateur(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer l'accompagnateur ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer l'accompagnateur "{deleteAccompagnateur}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAccompagnateur} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteCategory} onOpenChange={(open) => !open && setDeleteCategory(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer la catégorie ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer la catégorie "{deleteCategory}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteClub} onOpenChange={(open) => !open && setDeleteClub(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le club ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer le club "{deleteClub}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteClub} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteStade} onOpenChange={(open) => !open && setDeleteStade(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le stade ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer le stade "{deleteStade}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteStade} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
