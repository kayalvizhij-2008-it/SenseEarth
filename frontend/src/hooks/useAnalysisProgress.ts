import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { AnalysisStatusPayload } from "@/api/types";

/**
 * Polls `/analyses/{id}/status` while a job is queued or processing. Polling
 * stops as soon as the backend reports a terminal state — the job itself runs
 * in the backend's worker pool, so closing the tab does not cancel it.
 */
export function useAnalysisProgress(analysisId: string | undefined, enabled = true) {
  return useQuery<AnalysisStatusPayload>({
    queryKey: ["analysis-progress", analysisId],
    queryFn: () => api.analysisStatus(analysisId as string),
    enabled: Boolean(analysisId) && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 1200;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}
