import type { TileLayerOptions } from "leaflet";

/**
 * Keyless raster basemaps. Both providers send `Access-Control-Allow-Origin: *`
 * and need no API key, so nothing private ends up in the bundle.
 *
 * - NASA GIBS / MODIS Terra true colour — public domain, ~250 m, 1–2 day lag.
 * - CARTO dark basemaps — © OpenStreetMap contributors © CARTO.
 *
 * Basemaps are context only: change detection always runs on the analyst's
 * uploaded captures, never on these tiles.
 */
export type BasemapMode = "satellite" | "hybrid" | "map";

export function gibsDefaultDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 4);
  return date.toISOString().slice(0, 10);
}

export const GIBS_ATTRIBUTION =
  'NASA GIBS · MODIS Terra <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">Earthdata</a>';
export const CARTO_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

export interface BasemapLayer {
  key: string;
  url: string;
  attribution: string;
  options: TileLayerOptions;
  opacity?: number;
}

export function basemapLayers(mode: BasemapMode, date = gibsDefaultDate()): BasemapLayer[] {
  const layers: BasemapLayer[] = [];

  if (mode !== "map") {
    layers.push({
      key: "satellite",
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      attribution: GIBS_ATTRIBUTION,
      options: { maxNativeZoom: 9, maxZoom: 17, crossOrigin: true, className: "se-tiles-satellite" },
    });
  }

  if (mode === "map") {
    layers.push({
      key: "carto",
      url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      attribution: CARTO_ATTRIBUTION,
      options: { maxNativeZoom: 19, maxZoom: 19, crossOrigin: true },
    });
  }

  if (mode !== "satellite") {
    layers.push({
      key: "labels",
      url: "https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
      attribution: mode === "hybrid" ? CARTO_ATTRIBUTION : "",
      options: { maxNativeZoom: 19, maxZoom: 19, crossOrigin: true },
      opacity: 0.95,
    });
  }

  return layers;
}
