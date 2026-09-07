"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAppSettings } from "@/hooks/useAppSettings";
import { applyThemeVariables, hasThemeUserOverride } from "@/lib/settings";

export function AppThemeSync() {
  const { settings } = useAppSettings();
  const { setTheme } = useTheme();

  useEffect(() => {
    applyThemeVariables(settings);
    // Le réglage club (themeMode) sert de thème par défaut. Si l'utilisateur a
    // choisi manuellement un thème via le bouton bascule, on ne l'écrase pas.
    if (!hasThemeUserOverride()) {
      setTheme(settings.themeMode);
    }
  }, [settings, setTheme]);

  return null;
}
