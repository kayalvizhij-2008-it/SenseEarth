/**
 * The product palette is fixed by the trained model's label encoding
 * (`utils/palette.py` / `backend/app/ml/class_mapping.py`). Do not "improve"
 * these colours: a pixel's colour is the model's class id.
 */
export interface ChangeClass {
  id: number;
  key: string;
  label: string;
  hex: string;
  description: string;
  group: "water" | "vegetation" | "ground" | "built" | "sports" | "none";
}

export const CHANGE_CLASSES: ChangeClass[] = [
  {
    id: 0,
    key: "unchanged",
    label: "Unchanged",
    hex: "#FFFFFF",
    description: "Model did not flag this pixel as changed between the two dates.",
    group: "none",
  },
  {
    id: 1,
    key: "water",
    label: "Water",
    hex: "#0000FF",
    description: "New or altered water surface — flooding, reservoirs, coastline movement.",
    group: "water",
  },
  {
    id: 2,
    key: "ground",
    label: "Ground / bare land",
    hex: "#808080",
    description: "Exposed soil, cleared land, construction ground, dry riverbed.",
    group: "ground",
  },
  {
    id: 3,
    key: "low_vegetation",
    label: "Low vegetation",
    hex: "#008000",
    description: "Grassland, crops and scrub that appeared or replaced another class.",
    group: "vegetation",
  },
  {
    id: 4,
    key: "trees",
    label: "Trees",
    hex: "#00FF00",
    description: "Canopy gain or loss — plantation growth, clear-cutting, urban trees.",
    group: "vegetation",
  },
  {
    id: 5,
    key: "buildings",
    label: "Buildings",
    hex: "#800000",
    description: "Built-up surface: new construction, expansion, demolition.",
    group: "built",
  },
  {
    id: 6,
    key: "playground",
    label: "Playground / sports",
    hex: "#FF0000",
    description: "Sports grounds, courts and recreational surfaces.",
    group: "sports",
  },
];

export const CLASS_BY_ID = new Map(CHANGE_CLASSES.map((entry) => [entry.id, entry]));

export const GROUP_META: Record<string, { label: string; description: string; hex: string }> = {
  water: {
    label: "Water",
    description: "Surface water extent",
    hex: "#38BDF8",
  },
  vegetation: {
    label: "Vegetation",
    description: "Trees and low vegetation combined",
    hex: "#34D399",
  },
  ground: {
    label: "Ground",
    description: "Bare soil and exposed land",
    hex: "#A8A29E",
  },
  built: {
    label: "Built-up",
    description: "Buildings and impervious surface",
    hex: "#FB7185",
  },
  sports: {
    label: "Recreation",
    description: "Playgrounds and sports surfaces",
    hex: "#F472B6",
  },
};

export const STAGE_COPY: Record<string, string> = {
  queued: "Queued — waiting for a worker",
  loading_model: "Loading the network and checkpoint",
  preparing: "Decoding and aligning the image pair",
  inferring: "Running PSPNet-HRNet inference",
  postprocessing: "Deriving semantic classes and change mask",
  writing_artifacts: "Writing masks, overlays and statistics",
  completed: "Completed",
  failed: "Failed",
};

export const ANALYSIS_LIMITS = {
  maxUploadMb: 25,
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"],
  acceptedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
};

export function classHex(key: string | number): string {
  if (typeof key === "number") return CLASS_BY_ID.get(key)?.hex ?? "#94A3B8";
  return CHANGE_CLASSES.find((entry) => entry.key === key)?.hex ?? "#94A3B8";
}

export function classLabel(key: string | number): string {
  if (typeof key === "number") return CLASS_BY_ID.get(key)?.label ?? `Class ${key}`;
  return CHANGE_CLASSES.find((entry) => entry.key === key)?.label ?? key;
}

export const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/app/explore", label: "Explore Earth", icon: "globe" },
  { to: "/app/new", label: "New Analysis", icon: "scan" },
  { to: "/app/monitoring", label: "Monitoring", icon: "activity" },
  { to: "/app/reports", label: "Reports & History", icon: "archive" },
  { to: "/app/insights", label: "AI Insights", icon: "sparkles" },
  { to: "/app/settings", label: "Settings", icon: "settings" },
] as const;
