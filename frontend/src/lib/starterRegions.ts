import { bboxAreaKm2, bboxToPolygon, type BBox } from "@/lib/geo";

/**
 * Clearly labelled starter examples around Chennai.
 *
 * These are rough, editable boundaries for demonstration. They are not
 * authoritative administrative or ecological delineations, and no analyses are
 * claimed for them. Users can rename, redraw or delete each one.
 */
export interface StarterRegion {
  name: string;
  description: string;
  bbox: BBox;
  geometry: Record<string, unknown>;
}

function starter(
  name: string,
  description: string,
  bbox: BBox,
): StarterRegion {
  return {
    name,
    description: `${description} · Starter example with an approximate boundary. Edit or redraw before relying on it.`,
    bbox,
    geometry: bboxToPolygon(bbox) as unknown as Record<string, unknown>,
  };
}

export const CHENNAI_STARTER_REGIONS: StarterRegion[] = [
  starter(
    "Pallikaranai Marsh",
    "Wetland and marshland south of Chennai",
    [80.195, 12.912, 80.238, 12.958],
  ),
  starter(
    "Ennore Creek",
    "Creek and estuary mouth north of Chennai",
    [80.298, 13.205, 80.342, 13.255],
  ),
  starter(
    "Adyar River Corridor",
    "River corridor through south Chennai to the coast",
    [80.242, 12.998, 80.291, 13.032],
  ),
  starter(
    "Chennai Urban Expansion",
    "Western urban fringe growth corridor",
    [80.155, 13.01, 80.215, 13.075],
  ),
];

export function starterRegionPayload(region: StarterRegion) {
  const [west, south, east, north] = region.bbox;
  return {
    name: region.name,
    description: region.description,
    geometry: region.geometry,
    bbox: region.bbox,
    areaKm2: bboxAreaKm2(region.bbox) ?? undefined,
    center: [(west + east) / 2, (south + north) / 2] as [number, number],
  };
}
