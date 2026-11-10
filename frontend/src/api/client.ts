import { useAuthStore } from "@/store/auth";
import type {
  Analysis,
  AnalysisList,
  AnalysisResults,
  AnalysisStatusPayload,
  AnalyticsSummary,
  AuthResponse,
  ClassDistribution,
  ClassEntry,
  GroupStat,
  HealthPayload,
  HistoryPoint,
  Insights,
  ModelStatus,
  Region,
  RegionActivity,
  SavedArea,
  StorageUsage,
  User,
} from "./types";

/**
 * The API base URL *includes* the `/api` prefix, e.g. `http://localhost:8000/api`.
 * Media URLs coming back from the server are absolute paths under `/api/...`.
 */
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
export const API_BASE = (RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : "http://localhost:8000/api").replace(
  /\/+$/,
  "",
);
/** Origin without the `/api` suffix — used to resolve server-relative artifact paths. */
export const API_ORIGIN = API_BASE.replace(/\/api$/, "");

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (item && typeof item === "object") {
          const entry = item as { msg?: string; loc?: (string | number)[] };
          const where = Array.isArray(entry.loc) ? entry.loc.filter((p) => p !== "body").join(".") : "";
          return where ? `${where}: ${entry.msg ?? "invalid value"}` : (entry.msg ?? "invalid value");
        }
        return String(item);
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") return message;
  return fallback;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Send as multipart FormData untouched. */
  form?: FormData;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, form, auth = true, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  const token = useAuthStore.getState().token;
  if (auth && token) finalHeaders.set("Authorization", `Bearer ${token}`);

  let payload: BodyInit | undefined = form;
  if (body !== undefined && !form) {
    finalHeaders.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: payload,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the SenseEarth API. Is the backend running on port 8000?",
      0,
    );
  }

  if (response.status === 401 && auth) {
    useAuthStore.getState().logout();
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const parsed = isJson ? await response.json().catch(() => null) : await response.text().catch(() => "");

  if (!response.ok) {
    throw new ApiError(
      messageFromBody(parsed, `Request failed (${response.status})`),
      response.status,
      parsed,
    );
  }
  return parsed as T;
}

/** Resolve a server-relative artifact path (e.g. `/api/analyses/x/mask`) for `<img src>`. */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  const absolute = path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
  const token = useAuthStore.getState().token;
  if (!token) return absolute;
  return `${absolute}${absolute.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

async function download(path: string, filename: string): Promise<void> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    let detail = `Download failed (${response.status})`;
    try {
      const body = await response.json();
      detail = messageFromBody(body, detail);
    } catch {
      /* keep default */
    }
    throw new ApiError(detail, response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export interface CreateAnalysisInput {
  image1: File;
  image2: File;
  title: string;
  locationName?: string;
  latitude?: number | null;
  longitude?: number | null;
  dateBefore?: string;
  dateAfter?: string;
  area?: SavedArea | null;
  regionId?: string | null;
  onProgress?: (fraction: number) => void;
}

function createAnalysisForm(input: CreateAnalysisInput): FormData {
  const form = new FormData();
  form.append("image1", input.image1);
  form.append("image2", input.image2);
  form.append("title", input.title.trim());
  if (input.locationName) form.append("locationName", input.locationName);
  if (typeof input.latitude === "number" && Number.isFinite(input.latitude)) {
    form.append("latitude", String(input.latitude));
  }
  if (typeof input.longitude === "number" && Number.isFinite(input.longitude)) {
    form.append("longitude", String(input.longitude));
  }
  if (input.dateBefore) form.append("dateBefore", input.dateBefore);
  if (input.dateAfter) form.append("dateAfter", input.dateAfter);
  if (input.regionId) form.append("regionId", input.regionId);
  if (input.area?.bbox) form.append("bbox", JSON.stringify(input.area.bbox));
  if (input.area?.geometry) form.append("aoiGeometry", JSON.stringify(input.area.geometry));
  if (input.area?.areaKm2) form.append("areaKm2", String(input.area.areaKm2));
  return form;
}

/**
 * Uploads with `fetch` cannot report progress; we use XHR here so the UI can
 * show real upload progress instead of a fake indeterminate bar.
 */
function uploadAnalysis(input: CreateAnalysisInput): Promise<Analysis> {
  const form = createAnalysisForm(input);
  const token = useAuthStore.getState().token;
  return new Promise<Analysis>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/analyses`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () =>
      reject(new ApiError("Upload failed — the API is unreachable. Is the backend running?", 0));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as Analysis);
        return;
      }
      if (xhr.status === 401) useAuthStore.getState().logout();
      reject(new ApiError(messageFromBody(body, `Upload failed (${xhr.status})`), xhr.status, body));
    };
    xhr.send(form);
  });
}

export interface AnalysisQuery {
  q?: string;
  status?: string;
  regionId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  // ---- system ----
  health: () => request<HealthPayload>("/health", { auth: false }),
  modelStatus: () => request<ModelStatus>("/model/status"),
  classes: () => request<{ classes: ClassEntry[] }>("/model/classes", { auth: false }),
  storage: () => request<StorageUsage>("/system/storage"),
  recoverStaleJobs: () => request<{ recovered: number }>("/system/recover-stale-jobs", { method: "POST" }),

  // ---- auth ----
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: (payload: { name: string; email: string; password: string; organization?: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: payload, auth: false }),
  demo: () => request<AuthResponse>("/auth/demo", { method: "POST", auth: false }),
  me: () => request<User>("/auth/me"),
  updateMe: (payload: { name?: string; organization?: string }) =>
    request<User>("/auth/me", { method: "PATCH", body: payload }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ updated: boolean }>("/auth/password", { method: "POST", body: payload }),

  // ---- analyses ----
  createAnalysis: uploadAnalysis,
  listAnalyses: (query: AnalysisQuery = {}) =>
    request<AnalysisList>(`/analyses${toQuery({ ...query })}`),
  getAnalysis: (id: string) => request<Analysis>(`/analyses/${id}`),
  analysisStatus: (id: string) => request<AnalysisStatusPayload>(`/analyses/${id}/status`),
  results: (id: string) => request<AnalysisResults>(`/analyses/${id}/results`),
  insights: (id: string) => request<Insights>(`/analyses/${id}/insights`),
  retry: (id: string) => request<Analysis>(`/analyses/${id}/retry`, { method: "POST" }),
  removeAnalysis: (id: string) => request<void>(`/analyses/${id}`, { method: "DELETE" }),
  downloadReport: (id: string, format: "pdf" | "csv" | "zip") =>
    download(
      `/analyses/${id}/report?format=${format}`,
      `senseearth-${id.slice(0, 8)}.${format === "zip" ? "zip" : format}`,
    ),

  // ---- analytics ----
  summary: () => request<AnalyticsSummary>("/analytics/summary"),
  classDistribution: () => request<ClassDistribution>("/analytics/class-distribution"),
  history: (days = 30) => request<{ days: number; points: HistoryPoint[] }>(`/analytics/history?days=${days}`),
  recent: (limit = 6) => request<{ items: Analysis[] }>(`/analytics/recent?limit=${limit}`),
  regionActivity: () => request<{ regions: RegionActivity[]; total: number }>("/analytics/regions"),
  compare: (ids: string[]) =>
    request<{
      items: Array<{
        analysis: Analysis;
        changedClasses: ClassEntry[];
        groups: GroupStat[];
        changeRatio: number;
        changedAreaKm2: number;
      }>;
      requested: number;
      note: string;
    }>(`/analytics/compare?ids=${encodeURIComponent(ids.join(","))}`),

  // ---- regions ----
  listRegions: () => request<{ items: Region[]; total: number }>("/regions"),
  createRegion: (payload: {
    name: string;
    description?: string;
    geometry: Record<string, unknown>;
    bbox?: [number, number, number, number];
    areaKm2?: number;
    center?: [number, number];
  }) => request<Region>("/regions", { method: "POST", body: payload }),
  removeRegion: (id: string) => request<void>(`/regions/${id}`, { method: "DELETE" }),
};

