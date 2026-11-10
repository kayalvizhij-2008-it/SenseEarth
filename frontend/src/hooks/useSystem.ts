import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 20_000,
    staleTime: 8_000,
    retry: 1,
  });
}

export function useModelStatus() {
  return useQuery({
    queryKey: ["model-status"],
    queryFn: api.modelStatus,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useSummary() {
  return useQuery({ queryKey: ["summary"], queryFn: api.summary, staleTime: 15_000 });
}

export function useClassDistribution() {
  return useQuery({ queryKey: ["class-distribution"], queryFn: api.classDistribution, staleTime: 15_000 });
}

export function useHistory(days = 30) {
  return useQuery({ queryKey: ["history", days], queryFn: () => api.history(days), staleTime: 15_000 });
}

export function useRecentAnalyses(limit = 6) {
  return useQuery({ queryKey: ["recent", limit], queryFn: () => api.recent(limit), staleTime: 10_000 });
}

export function useRegionActivity() {
  return useQuery({ queryKey: ["region-activity"], queryFn: api.regionActivity, staleTime: 10_000 });
}

export function useRegions() {
  return useQuery({ queryKey: ["regions"], queryFn: api.listRegions, staleTime: 10_000 });
}

export function useStorageUsage() {
  return useQuery({ queryKey: ["storage"], queryFn: api.storage, staleTime: 30_000 });
}
