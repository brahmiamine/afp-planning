export interface EventWorkspaceModuleLoadOptions {
  base: string;
  withScope: (url: string) => string;
  collaborationEnabled: boolean;
  weatherEnabled: boolean;
  weatherUrl: string;
  apiGet: (url: string) => Promise<unknown>;
}

export interface EventWorkspaceModuleLoadResult<
  TSnapshot,
  TCollaboration,
  TReports,
  TAttachments,
  TWeather,
> {
  snapshot: TSnapshot;
  collaboration: TCollaboration | null;
  reports: TReports | null;
  attachments: TAttachments | null;
  weather: TWeather | null;
}

/**
 * Charge toujours le snapshot principal, puis isole les modules optionnels.
 * Un module désactivé ou en erreur retourne null sans faire échouer le détail
 * de l'événement. Seul l'échec du snapshot principal est bloquant.
 */
export async function loadEventWorkspaceModules<
  TSnapshot,
  TCollaboration,
  TReports,
  TAttachments,
  TWeather,
>({
  base,
  withScope,
  collaborationEnabled,
  weatherEnabled,
  weatherUrl,
  apiGet,
}: EventWorkspaceModuleLoadOptions): Promise<
  EventWorkspaceModuleLoadResult<TSnapshot, TCollaboration, TReports, TAttachments, TWeather>
> {
  const [snapshotResult, collaborationResult, reportResult, attachmentResult, weatherResult] =
    await Promise.allSettled([
      apiGet(withScope(base)),
      collaborationEnabled
        ? apiGet(withScope(`${base}/collaboration`))
        : Promise.resolve(null),
      collaborationEnabled
        ? apiGet(withScope(`${base}/reports`))
        : Promise.resolve(null),
      collaborationEnabled
        ? apiGet(withScope(`${base}/attachments`))
        : Promise.resolve(null),
      weatherEnabled ? apiGet(weatherUrl) : Promise.resolve(null),
    ]);

  if (snapshotResult.status === 'rejected') throw snapshotResult.reason;

  return {
    snapshot: snapshotResult.value as TSnapshot,
    collaboration:
      collaborationResult.status === 'fulfilled'
        ? (collaborationResult.value as TCollaboration | null)
        : null,
    reports: reportResult.status === 'fulfilled' ? (reportResult.value as TReports | null) : null,
    attachments:
      attachmentResult.status === 'fulfilled'
        ? (attachmentResult.value as TAttachments | null)
        : null,
    weather: weatherResult.status === 'fulfilled' ? (weatherResult.value as TWeather | null) : null,
  };
}
