export interface EventWorkspaceModuleLoadOptions {
  base: string;
  withScope: (url: string) => string;
  collaborationEnabled: boolean;
  weatherEnabled: boolean;
  weatherUrl: string;
  apiGet: <T>(url: string) => Promise<T>;
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
      apiGet<TSnapshot>(withScope(base)),
      collaborationEnabled
        ? apiGet<TCollaboration>(withScope(`${base}/collaboration`))
        : Promise.resolve(null),
      collaborationEnabled
        ? apiGet<TReports>(withScope(`${base}/reports`))
        : Promise.resolve(null),
      collaborationEnabled
        ? apiGet<TAttachments>(withScope(`${base}/attachments`))
        : Promise.resolve(null),
      weatherEnabled ? apiGet<TWeather>(weatherUrl) : Promise.resolve(null),
    ]);

  if (snapshotResult.status === 'rejected') throw snapshotResult.reason;

  return {
    snapshot: snapshotResult.value,
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
