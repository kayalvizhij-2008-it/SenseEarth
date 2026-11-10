import type { SavedArea } from "@/api/types";

export type BBox = [number, number, number, number];

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Matches the backend's planar approximation used for reported areas. */
export function bboxAreaKm2(bbox: BBox | null | undefined): number | null {
  if (!bbox) return null;
  const [west, south, east, north] = bbox;
  const midLat = ((south + north) / 2) * (Math.PI / 180);
  const widthKm = ((east - west) * Math.PI / 180) * EARTH_RADIUS_KM * Math.cos(midLat);
  const heightKm = ((north - south) * Math.PI / 180) * EARTH_RADIUS_KM;
  return Math.abs(widthKm * heightKm);
}

export function bboxCenter(bbox: BBox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

/** Longitude span for a map viewport centred on `center` at `zoom`, in degrees. */
export function viewportSpan(zoom: number, latitude: number, viewportWidth = 900): { lon: number; lat: number } {
  // 512 px tiles: world width in pixels = 256 * 2^zoom (MapLibre uses 512px tiles => 512 * 2^zoom / 2).
  const worldPx = 256 * 2 ** zoom;
  const lonSpan = (viewportWidth / worldPx) * 360;
  const latSpan = lonSpan * Math.cos(toRad(latitude)) * 0.62;
  return { lon: lonSpan, lat: latSpan };
}

export function bboxFromViewport(center: [number, number], zoom: number): BBox {
  const { lon, lat } = viewportSpan(zoom, center[1]);
  const west = Math.max(-180, center[0] - lon / 2);
  const east = Math.min(180, center[0] + lon / 2);
  const south = Math.max(-85, center[1] - lat / 2);
  const north = Math.min(85, center[1] + lat / 2);
  return [west, south, east, north];
}

export function bboxToPolygon(bbox: BBox): GeoJSONPolygon {
  const [west, south, east, north] = bbox;
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export function areaFromBbox(bbox: BBox, label: string): SavedArea {
  return {
    label,
    bbox,
    center: bboxCenter(bbox),
    areaKm2: bboxAreaKm2(bbox),
    geometry: bboxToPolygon(bbox) as unknown as Record<string, unknown>,
  };
}

export function formatCoords(lat: number | null, lon: number | null): string {
  if (lat === null || lon === null) return "No coordinates";
  const latLabel = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lonLabel = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  return `${latLabel}, ${lonLabel}`;
}

export function parseCoordinatePair(input: string): { lat: number; lon: number } | null {
  const matches = input.match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length < 2) return null;
  const lat = Number(matches[0]);
  const lon = Number(matches[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function isValidBbox(value: unknown): value is BBox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry)) &&
    value[0] < value[2] &&
    value[1] < value[3]
  );
}

export const PRESET_AREAS: Array<{ name: string; detail: string; center: [number, number]; zoom: number }> = [
  { name: "Palm Jumeirah", detail: "Dubai, United Arab Emirates", center: [55.13, 25.11], zoom: 11.4 },
  { name: "Rotterdam Harbour", detail: "Netherlands", center: [4.28, 51.94], zoom: 10.6 },
  { name: "Three Gorges Reservoir", detail: "Hubei, China", center: [110.9, 30.87], zoom: 9.2 },
  { name: "Lake Urmia", detail: "Iran", center: [45.45, 37.7], zoom: 8.6 },
  { name: "Lagos Coastline", detail: "Nigeria", center: [3.42, 6.45], zoom: 10.4 },
  { name: "Atacama Mining District", detail: "Chile", center: [-69.05, -23.4], zoom: 9.4 },
];
