"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAppSettings } from "@/hooks/useAppSettings";
import { applyThemeVariables } from "@/lib/settings";

export function AppThemeSync() {
  const { settings } = useAppSettings();
  const { setTheme } = useTheme();

  useEffect(() => {
    applyThemeVariables(settings);
    setTheme(settings.themeMode);
  }, [settings, setTheme]);

  return null;
}
