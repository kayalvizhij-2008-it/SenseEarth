/** Types mirror `backend/app/schemas/schemas.py` and `services/serializers.py`. */

export type AnalysisStatus = "queued" | "processing" | "completed" | "failed";

export interface User {
  id: string;
  email: string;
  name: string;
  organization: string | null;
  isDemo: boolean;
  createdAt: string | null;
  avatarUrl?: string | null;
  provider?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  expiresIn: number;
}

export interface ClassEntry {
  id: number;
  key: string;
  label: string;
  labelZh?: string;
  rgb?: [number, number, number];
  hex: string;
  pixels: number;
  ratio: number;
  areaKm2?: number;
}

export interface GroupStat {
  key: "water" | "vegetation" | "ground" | "built" | "sports" | string;
  pixels: number;
  ratio: number;
  changedRatio: number;
  areaKm2: number;
}

export interface ClassTransition {
  from: { id: number; label: string; hex: string };
  to: { id: number; label: string; hex: string };
  pixels: number;
  ratio: number;
}

export interface EngineInfo {
  name?: string;
  label?: string;
  semanticAvailable: boolean;
  device?: string;
  inferenceMs?: number;
  [key: string]: unknown;
}

export interface Statistics {
  width: number;
  height: number;
  pixels: number;
  changedPixels: number;
  unchangedPixels: number;
  changeRatio: number;
  areaKm2: number | null;
  changedAreaKm2: number;
  pixelAreaM2: number | null;
  areaSource: "aoi" | "bbox" | "none";
  classes: ClassEntry[];
  classesBefore: ClassEntry[];
  changedClasses: ClassEntry[];
  transitions: ClassTransition[];
  groups: GroupStat[];
  classCount: number;
  warnings: string[];
  engine?: EngineInfo;
}

export interface Analysis {
  id: string;
  title: string;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  bbox: [number, number, number, number] | null;
  dateBefore: string | null;
  dateAfter: string | null;
  status: AnalysisStatus;
  progress: number;
  stage: string;
  error: string | null;
  engine: string | null;
  engineLabel: string | null;
  modelName: string | null;
  device: string | null;
  width: number | null;
  height: number | null;
  pixels: number | null;
  changedPixels: number | null;
  changeRatio: number | null;
  areaKm2: number | null;
  regionId: string | null;
  inferenceMs: number | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  thumbnails: { before: string | null; after: string | null };
  artifacts: {
    binaryMask: string | null;
    semanticMask: string | null;
    overlay: string | null;
    semanticRgb: string | null;
    reportPdf: string | null;
    reportCsv: string | null;
    bundleZip: string | null;
  };
}

export interface AnalysisStatusPayload {
  id: string;
  status: AnalysisStatus;
  progress: number;
  stage: string;
  error: string | null;
  completedAt: string | null;
}

export interface AnalysisList {
  items: Analysis[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface AnalysisResults {
  analysis: Analysis;
  statistics: Statistics;
  regions: Region | null;
  engineNotice?: string | null;
}

export interface Region {
  id: string;
  name: string;
  description: string | null;
  geometry: Record<string, unknown>;
  bbox: [number, number, number, number] | null;
  areaKm2: number | null;
  center: [number, number] | null;
  createdAt: string | null;
  analysisCount: number;
  latestAnalysis: {
    id: string;
    title: string;
    status: AnalysisStatus;
    completedAt: string | null;
    changeRatio: number | null;
    changedPixels: number | null;
  } | null;
}

export interface RegionActivity extends Region {
  changes: Array<{
    id: string;
    title: string;
    status: AnalysisStatus;
    changeRatio: number | null;
    changedPixels: number | null;
    completedAt: string | null;
    dateAfter: string | null;
  }>;
}

export interface AnalyticsSummary {
  totalAnalyses: number;
  completed: number;
  processing: number;
  queued: number;
  failed: number;
  totalChangedPixels: number;
  totalAreaKm2: number;
  totalChangedAreaKm2: number;
  averageChangeRatio: number;
  regions: number;
  lastCompletedAt: string | null;
  sampleSize: number;
}

export interface ClassDistribution {
  classes: ClassEntry[];
  analysesConsidered: number;
  totalPixels: number;
  note: string;
}

export interface HistoryPoint {
  date: string;
  completed: number;
  failed: number;
  changedPixels: number;
  created: number;
}

export interface HealthPayload {
  status: string;
  app: string;
  version: string;
  uptimeSeconds: number;
  database: string;
  model: { available: boolean; loaded: boolean; device: string; name: string };
  queue: { active: number; queued: number; workers: number };
  python: string;
}

export interface ModelStatus {
  available: boolean;
  loaded: boolean;
  device: string;
  activeDevice?: string;
  name: string;
  model?: string;
  backbone?: string;
  weightsPath: string;
  weightsPresent: boolean;
  weightsBytes: number;
  weightsFingerprint?: string | null;
  parameters?: number | null;
  parameterCount?: number | null;
  numSemanticClasses?: number;
  classCount?: number;
  semanticChannels?: number;
  classOffset?: number;
  inputSize?: number;
  changeThreshold?: number;
  tta?: boolean;
  torchVersion?: string;
  cudaAvailable?: boolean;
  loadedAt?: string | null;
  loadMs?: number | null;
  error?: string | null;
  classes: ClassEntry[];
  baselineFallbackEnabled: boolean;
  inputRequirements: {
    channels: number;
    normalization: string;
    alignment: string;
    defaultInputSize: number;
    maxInputSize: number;
    allowedFormats: string[];
    maxUploadMb: number;
  };
  notes?: string[];
}

export interface Insights {
  analysisId: string;
  headline: string;
  summary: string;
  observations: string[];
  caveats: string[];
  generatedBy: string;
  source: string;
}

export interface StorageUsage {
  uploadsBytes: number;
  predictionsBytes: number;
  reportsBytes: number;
  totalBytes: number;
  analyses: number;
  completedAnalyses: number;
  modelWeightsBytes: number;
  uploads: number;
  predictions: number;
  reports: number;
}

export interface SavedArea {
  label: string;
  bbox: [number, number, number, number] | null;
  center: [number, number] | null;
  areaKm2: number | null;
  geometry: Record<string, unknown> | null;
  zoom?: number;
}

export interface ApiErrorBody {
  detail?: string | Array<{ msg?: string; loc?: (string | number)[] }>;
}
