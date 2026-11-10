import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BoxSelect,
  Crosshair,
  Layers3,
  Loader2,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  MousePointer2,
  Pentagon,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import type { Analysis } from "@/api/types";
import { Badge, Button, Field, Input, Panel, PanelHeader } from "@/components/ui";
import { CosmicOrb } from "@/components/visuals/CosmicOrb";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRegions } from "@/hooks/useSystem";
import { CHANGE_CLASSES } from "@/lib/classes";
import { formatArea } from "@/lib/format";
import { PRESET_AREAS, formatCoords } from "@/lib/geo";
import { basemapLayers, gibsDefaultDate, type BasemapMode } from "@/lib/mapStyle";
import { useSelectionStore } from "@/store/selection";
import { toast } from "@/store/ui";

type Tool = "pan" | "box" | "polygon" | "point";
type Ring = [number, number][];

interface Selection {
  geometry: { type: "Polygon"; coordinates: number[][][] };
  bbox: [number, number, number, number];
  center: [number, number];
  areaKm2: number;
  label: string;
}

const LIMES = "#c6f36b";
const IVORY = "#f3f0e7";

/** Planar area approximation, matching the backend's reported AOI area. */
function polygonAreaKm2(ring: Ring): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.574;
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * kx * y2 * ky - x2 * kx * y1 * ky;
  }
  return Math.abs(sum / 2);
}

function ringToSelection(ring: Ring, label: string): Selection {
  const lons = ring.map((point) => point[0]);
  const lats = ring.map((point) => point[1]);
  const bbox: [number, number, number, number] = [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];
  return {
    geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
    bbox,
    center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    areaKm2: polygonAreaKm2(ring),
    label,
  };
}

function bboxRing(bbox: [number, number, number, number]): Ring {
  const [w, s, e, n] = bbox;
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
  ];
}

/** Leaflet draws [lat, lng]; every geometry coming from PostGIS-style JSON is [lng, lat]. */
const toLatLng = (point: number[]): [number, number] => [point[1], point[0]];

export default function ExplorePage() {
  useDocumentTitle("Explore Earth");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const storedArea = useSelectionStore((state) => state.area);
  const setStoredArea = useSelectionStore((state) => state.setArea);

  const shellRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<L.Layer[]>([]);
  const aoiRef = useRef<L.LayerGroup | null>(null);
  const draftGroupRef = useRef<L.LayerGroup | null>(null);
  const regionGroupRef = useRef<L.LayerGroup | null>(null);
  const analysisGroupRef = useRef<L.LayerGroup | null>(null);
  const toolRef = useRef<Tool>("pan");
  const boxStartRef = useRef<[number, number] | null>(null);
  const draftRef = useRef<Ring | null>(null);
  const commitRef = useRef<(ring: Ring, label: string) => void>(() => undefined);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const [mode, setMode] = useState<BasemapMode>("satellite");
  const [date, setDate] = useState(gibsDefaultDate());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<Ring | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ name: string; detail: string; center: [number, number] }>>([]);
  const [searching, setSearching] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [showLayers, setShowLayers] = useState(false);
  const [regionName, setRegionName] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  toolRef.current = tool;

  const regions = useRegions();
  const history = useQuery({
    queryKey: ["explore-analyses"],
    queryFn: () => api.listAnalyses({ pageSize: 40, status: "completed" }),
    staleTime: 30_000,
  });

  const located = useMemo(
    () =>
      (history.data?.items ?? []).filter(
        (item): item is Analysis => item.latitude !== null && item.longitude !== null,
      ),
    [history.data],
  );

  const commit = useCallback(
    (ring: Ring, label: string) => {
      if (ring.length < 3) return;
      const next = ringToSelection(ring, label);
      setSelection(next);
      setStoredArea({
        label,
        bbox: next.bbox,
        center: next.center,
        areaKm2: next.areaKm2,
        geometry: next.geometry as unknown as Record<string, unknown>,
        zoom: mapRef.current?.getZoom(),
      });
      draftRef.current = null;
      setDraft(null);
    },
    [setStoredArea],
  );
  commitRef.current = commit;

  // ------------------------------------------------------------------ map init
  useEffect(() => {
    const container = shellRef.current?.querySelector<HTMLElement>("[data-map]");
    if (!container) return;
    let map: L.Map;
    try {
      map = L.map(container, {
        zoomControl: false,
        attributionControl: true,
        minZoom: 2,
        maxZoom: 17,
        worldCopyJump: true,
        center: [storedArea?.center?.[1] ?? 22, storedArea?.center?.[0] ?? 30],
        zoom: storedArea?.zoom ?? 3,
      });
    } catch (error) {
      setMapError(error instanceof Error ? error.message : "The map could not start.");
      return;
    }
    mapRef.current = map;
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

    aoiRef.current = L.layerGroup().addTo(map);
    regionGroupRef.current = L.layerGroup().addTo(map);
    analysisGroupRef.current = L.layerGroup().addTo(map);
    draftGroupRef.current = L.layerGroup().addTo(map);

    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      setCursor({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    map.on("mouseout", () => setCursor(null));

    map.on("click", (event: L.LeafletMouseEvent) => {
      const active = toolRef.current;
      if (active === "polygon") {
        const next = [...(draftRef.current ?? []), [event.latlng.lng, event.latlng.lat] as [number, number]];
        draftRef.current = next;
        setDraft(next);
        return;
      }
      if (active === "point") {
        const bounds = map.getBounds();
        commitRef.current(
          bboxRing([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]),
          `Point ${event.latlng.lat.toFixed(4)}, ${event.latlng.lng.toFixed(4)}`,
        );
      }
    });

    map.on("mousedown", (event: L.LeafletMouseEvent) => {
      if (toolRef.current !== "box") return;
      boxStartRef.current = [event.latlng.lng, event.latlng.lat];
      map.dragging.disable();
    });

    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      if (toolRef.current !== "box" || !boxStartRef.current) return;
      const [lng, lat] = boxStartRef.current;
      draftRef.current = [
        [lng, lat],
        [event.latlng.lng, lat],
        [event.latlng.lng, event.latlng.lat],
        [lng, event.latlng.lat],
      ];
      setDraft(draftRef.current);
    });

    map.on("mouseup", () => {
      if (toolRef.current !== "box" || !boxStartRef.current) return;
      const ring = draftRef.current;
      boxStartRef.current = null;
      map.dragging.enable();
      if (ring && polygonAreaKm2(ring) > 0) commitRef.current(ring, "Drawn rectangle");
    });

    map.on("dblclick", () => {
      if (toolRef.current !== "polygon") return;
      const ring = draftRef.current;
      if (ring && ring.length >= 3) commitRef.current(ring, "Drawn polygon");
    });

    setMapReady(true);
    window.setTimeout(() => map.invalidateSize(), 120);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------------------- basemap swap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    baseLayersRef.current.forEach((layer) => map.removeLayer(layer));
    baseLayersRef.current = basemapLayers(mode, date).map((spec) => {
      const layer = L.tileLayer(spec.url, {
        ...spec.options,
        attribution: spec.attribution,
        opacity: spec.opacity ?? 1,
        detectRetina: false,
      });
      layer.addTo(map);
      layer.on("tileerror", () => setMapError("Some basemap tiles could not be loaded. Check the connection."));
      layer.on("load", () => setMapError(null));
      return layer;
    });
    baseLayersRef.current.forEach((layer) => (layer as L.TileLayer).bringToBack());
  }, [mode, date, mapReady]);

  // -------------------------------------------------------------- overlays
  useEffect(() => {
    if (!mapReady) return;
    const aoi = aoiRef.current;
    aoi?.clearLayers();
    if (selection) {
      const ring = selection.geometry.coordinates[0].map(toLatLng);
      L.polygon(ring, { color: LIMES, weight: 2, fillColor: LIMES, fillOpacity: 0.12, interactive: false }).addTo(
        aoi ?? L.layerGroup(),
      );
    }

    const draftGroup = draftGroupRef.current;
    draftGroup?.clearLayers();
    if (draft && draft.length > 1) {
      const points = draft.map(toLatLng);
      if (draft.length > 2) {
        L.polygon(points, {
          color: LIMES,
          weight: 1.5,
          dashArray: "6 5",
          fillColor: LIMES,
          fillOpacity: 0.06,
          interactive: false,
        }).addTo(draftGroup ?? L.layerGroup());
      } else {
        L.polyline(points, { color: LIMES, weight: 1.5, dashArray: "6 5", interactive: false }).addTo(
          draftGroup ?? L.layerGroup(),
        );
      }
    }

    const regionGroup = regionGroupRef.current;
    regionGroup?.clearLayers();
    (regions.data?.items ?? []).forEach((region) => {
      const geometry = region.geometry as { type?: string; coordinates?: unknown } | null;
      const rings =
        geometry?.type === "Polygon"
          ? (geometry.coordinates as number[][][]).map((ring) => ring.map(toLatLng))
          : region.bbox
            ? [bboxRing(region.bbox).concat([bboxRing(region.bbox)[0]]).map(toLatLng)]
            : [];
      if (!rings.length) return;
      L.polygon(rings, {
        color: IVORY,
        weight: 1.2,
        dashArray: "5 5",
        opacity: 0.55,
        fill: false,
        interactive: true,
      })
        .bindTooltip(region.name, { direction: "top", className: "se-map-tooltip" })
        .addTo(regionGroup ?? L.layerGroup());
    });

    const analysisGroup = analysisGroupRef.current;
    analysisGroup?.clearLayers();
    located.forEach((analysis) => {
      if (analysis.latitude === null || analysis.longitude === null) return;
      L.circleMarker([analysis.latitude, analysis.longitude], {
        radius: 4,
        color: "#151711",
        weight: 1,
        fillColor: LIMES,
        fillOpacity: 0.95,
      })
        .bindTooltip(analysis.title, { direction: "top", className: "se-map-tooltip" })
        .addTo(analysisGroup ?? L.layerGroup());
    });
  }, [selection, draft, mapReady, regions.data, located]);

  // --------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        draftRef.current = null;
        setDraft(null);
      }
      if (event.key === "Enter" && toolRef.current === "polygon" && draftRef.current && draftRef.current.length >= 3) {
        commitRef.current(draftRef.current, "Drawn polygon");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------------------------------ tools
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tool === "polygon") map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    if (tool !== "box") {
      boxStartRef.current = null;
      map.dragging.enable();
    }
    draftRef.current = null;
    setDraft(null);
    const container = map.getContainer();
    container.style.cursor = tool === "pan" ? "" : "crosshair";
  }, [tool]);

  // -------------------------------------------------------------- fullscreen
  useEffect(() => {
    const onChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      window.setTimeout(() => mapRef.current?.invalidateSize(), 240);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!shellRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current.requestFullscreen();
    } catch {
      toast("error", "Fullscreen was blocked", "Your browser refused the request.");
    }
  };

  // ------------------------------------------------------------------ search
  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=6&lang=en`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as {
          features?: Array<{
            properties: { name?: string; city?: string; state?: string; country?: string };
            geometry: { coordinates: [number, number] };
          }>;
        };
        setResults(
          (body.features ?? []).map((feature) => ({
            name: feature.properties.name ?? feature.properties.city ?? "Unnamed place",
            detail: [feature.properties.state, feature.properties.country].filter(Boolean).join(", "),
            center: feature.geometry.coordinates,
          })),
        );
      } catch {
        /* offline or blocked: panning and drawing still work */
      } finally {
        setSearching(false);
      }
    }, 360);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const goTo = (center: [number, number], zoom = 12) => {
    mapRef.current?.flyTo([center[1], center[0]], zoom, { duration: 1.4 });
    setQuery("");
    setResults([]);
  };

  const resetView = () => {
    mapRef.current?.flyTo([22, 30], 3, { duration: 1.2 });
    setSelection(null);
    setStoredArea(null);
    draftRef.current = null;
    setDraft(null);
  };

  const saveRegion = useMutation({
    mutationFn: async () => {
      if (!selection) throw new Error("Draw an area first.");
      return api.createRegion({
        name: regionName.trim() || selection.label,
        description: `Saved from Explore Earth · ${formatArea(selection.areaKm2)}`,
        geometry: selection.geometry as unknown as Record<string, unknown>,
        bbox: selection.bbox,
        areaKm2: selection.areaKm2,
        center: selection.center,
      });
    },
    onSuccess: () => {
      toast("success", "Monitoring area saved", "Find it under Monitoring.");
      setRegionName("");
      void queryClient.invalidateQueries({ queryKey: ["regions"] });
      void queryClient.invalidateQueries({ queryKey: ["region-activity"] });
    },
    onError: (error) =>
      toast("error", "Could not save the area", error instanceof ApiError ? error.message : String(error)),
  });

  const toolHint =
    tool === "box"
      ? "Drag on the map to draw a rectangle."
      : tool === "polygon"
        ? "Click to add corners · double-click or Enter to close."
        : tool === "point"
          ? "Click a location. The current view becomes the area."
          : "Drag to pan, scroll to zoom.";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <CosmicOrb className="hidden size-[74px] shrink-0 sm:block" rings={false} particles={false} intensity={1.05} speed={0.7} />
          <div>
            <p className="se-tag flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary" /> Geospatial workspace
            </p>
            <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">
              Choose a region to investigate.
            </h1>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">
              Frame an area, read its coordinates, then carry it into a comparison. Basemaps are context —
              the model only ever sees the captures you upload.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetView} icon={<RotateCcw className="size-3.5" />}>
            Reset view
          </Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen} icon={fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}>
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </Button>
          <Button variant="primary" size="sm" disabled={!selection} onClick={() => navigate("/app/new")} icon={<Plus className="size-3.5" />}>
            Start comparison
          </Button>
        </div>
      </header>

      <div
        ref={shellRef}
        className="se-noise relative overflow-hidden rounded-2xl border border-line bg-bg-deep"
      >
        <div
          data-map
          className="h-[calc(100vh-14rem)] min-h-[540px] w-full lg:h-[calc(100vh-13rem)]"
          aria-label="Interactive map"
        />

        {!mapReady && !mapError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bg-deep/80 backdrop-blur-sm">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Warming the map engine</p>
          </div>
        )}

        {mapError && (
          <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 border-b border-danger/30 bg-danger/10 px-4 py-2 text-[11.5px] text-danger backdrop-blur">
            <span>Map error: {mapError}</span>
            <button onClick={() => setMapError(null)} aria-label="Dismiss map error"><X className="size-3.5" /></button>
          </div>
        )}

        {/* search */}
        <div className="absolute left-3 top-3 z-20 w-[min(320px,calc(100%-9rem))]">
          <div className="rounded-xl border border-line/90 bg-bg/85 shadow-[0_20px_45px_-25px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a place, city or landmark"
                aria-label="Search places"
                className="h-10 w-full rounded-xl bg-transparent pl-9 pr-8 text-[12.5px] text-ink placeholder:text-muted/80 focus:outline-none"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted" />}
              {!searching && query && (
                <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label="Clear search">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {results.length > 0 && (
              <ul className="border-t border-line/80 p-1">
                {results.map((result) => (
                  <li key={`${result.name}-${result.center.join(",")}`}>
                    <button
                      onClick={() => goTo(result.center)}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                    >
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-ink">{result.name}</span>
                        <span className="block truncate text-[10px] text-muted">{result.detail || "OpenStreetMap result"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* basemap + layers */}
        <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line/90 bg-bg/85 p-1 backdrop-blur-xl">
            {(
              [
                ["satellite", "Satellite"],
                ["hybrid", "Hybrid"],
                ["map", "Map"],
              ] as Array<[BasemapMode, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={clsx(
                  "rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  mode === value ? "bg-primary text-primary-ink" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {mode !== "map" && (
              <input
                type="date"
                value={date}
                min="2000-02-24"
                max={gibsDefaultDate()}
                onChange={(event) => setDate(event.target.value)}
                aria-label="Imagery date"
                className="h-8 rounded-lg border border-line/90 bg-bg/85 px-2 font-mono text-[10.5px] text-ink-soft backdrop-blur-xl focus:border-primary/60 focus:outline-none"
              />
            )}
            <button
              onClick={() => setShowLayers((value) => !value)}
              aria-expanded={showLayers}
              className={clsx(
                "flex size-8 items-center justify-center rounded-lg border border-line/90 backdrop-blur-xl transition-colors",
                showLayers ? "bg-primary text-primary-ink" : "bg-bg/85 text-muted hover:text-ink",
              )}
              aria-label="Layer controls"
            >
              <Layers3 className="size-3.5" />
            </button>
          </div>

          {showLayers && (
            <div className="w-56 rounded-xl border border-line bg-surface/95 p-3 text-[11.5px] shadow-2xl backdrop-blur-xl">
              <p className="se-tag mb-2">Layers</p>
              <label className="flex items-center justify-between gap-2 py-1 text-ink-soft">
                <span>Area of interest</span>
                <input type="checkbox" checked readOnly className="accent-[var(--se-primary)]" />
              </label>
              <label className="flex items-center justify-between gap-2 py-1 text-ink-soft">
                <span>Saved regions ({regions.data?.total ?? 0})</span>
                <input
                  type="checkbox"
                  checked
                  readOnly
                  className="accent-[var(--se-primary)]"
                />
              </label>
              <label className="flex items-center justify-between gap-2 py-1 text-ink-soft">
                <span>Stored results ({located.length})</span>
                <input type="checkbox" checked readOnly className="accent-[var(--se-primary)]" />
              </label>
              <label className="flex items-center justify-between gap-2 py-1 text-ink-soft">
                <span>Class legend</span>
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={(event) => setShowLegend(event.target.checked)}
                  className="accent-[var(--se-primary)]"
                />
              </label>
              <p className="mt-2 border-t border-line pt-2 text-[10px] leading-relaxed text-muted">
                The map always shows your working AOI, saved regions and stored results. Basemap tiles are
                refreshed from the public NASA GIBS and CARTO endpoints.
              </p>
            </div>
          )}
        </div>

        {/* tools */}
        <div className="absolute left-3 top-16 z-20 flex flex-col gap-1 rounded-xl border border-line/90 bg-bg/85 p-1 backdrop-blur-xl">
          {(
            [
              ["pan", MousePointer2, "Pan and zoom"],
              ["box", BoxSelect, "Draw a rectangle"],
              ["polygon", Pentagon, "Draw a polygon"],
              ["point", Crosshair, "Pick a point"],
            ] as Array<[Tool, typeof MousePointer2, string]>
          ).map(([value, Icon, title]) => (
            <button
              key={value}
              onClick={() => setTool(value)}
              title={title}
              aria-label={title}
              aria-pressed={tool === value}
              className={clsx(
                "flex size-8 items-center justify-center rounded-lg transition-colors",
                tool === value ? "bg-primary text-primary-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>

        {/* coordinates */}
        <div className="pointer-events-none absolute bottom-16 left-3 z-20 rounded-lg border border-line/80 bg-bg/80 px-2.5 py-1.5 font-mono text-[10px] text-ink-soft backdrop-blur-xl sm:bottom-14">
          {cursor ? `LAT ${cursor.lat.toFixed(4)} · LON ${cursor.lng.toFixed(4)}` : "MOVE THE CURSOR TO READ COORDINATES"}
        </div>

        {showLegend && (
          <div className="absolute bottom-3 left-3 z-20 hidden w-[230px] rounded-xl border border-line/90 bg-bg/85 p-3 backdrop-blur-xl sm:block">
            <p className="se-tag mb-2">Legend</p>
            <ul className="space-y-1.5 text-[10.5px] text-ink-soft">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-4 rounded-sm border border-primary bg-primary/25" /> Working area of interest
              </li>
              <li className="flex items-center gap-2">
                <span className="h-0 w-4 border-t border-dashed border-ink/60" /> Saved monitoring region
              </li>
              <li className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary" /> Stored comparison result
              </li>
            </ul>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-line pt-2 text-[9.5px] text-muted">
              {CHANGE_CLASSES.map((item) => (
                <span key={item.id} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px]" style={{ background: item.hex }} />
                  {item.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[9.5px] leading-relaxed text-muted/80">
              Class colours appear on result masks, not on the basemap.
            </p>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-16 z-10 hidden font-mono text-[10px] uppercase tracking-[0.14em] text-ink/70 drop-shadow md:block">
          {toolHint}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Area of interest"
            description={selection ? selection.label : "Nothing selected yet"}
            icon={<Crosshair className="size-4" />}
          />
          <div className="mt-4">
          {selection ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Area", formatArea(selection.areaKm2)],
                  ["Centre", formatCoords(selection.center[1], selection.center[0])],
                  ["West / East", `${selection.bbox[0].toFixed(3)} / ${selection.bbox[2].toFixed(3)}`],
                  ["South / North", `${selection.bbox[1].toFixed(3)} / ${selection.bbox[3].toFixed(3)}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-line bg-surface-2/40 px-3 py-2">
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{label}</p>
                    <p className="mt-1 truncate text-[12px] text-ink">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Label this area" className="min-w-[200px] flex-1">
                  <Input
                    value={regionName}
                    onChange={(event) => setRegionName(event.target.value)}
                    placeholder={selection.label}
                    maxLength={80}
                  />
                </Field>
                <Button
                  variant="secondary"
                  onClick={() => saveRegion.mutate()}
                  disabled={saveRegion.isPending}
                  icon={saveRegion.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                >
                  Save as region
                </Button>
                <Button variant="ghost" onClick={resetView} icon={<Trash2 className="size-3.5" />}>
                  Clear
                </Button>
                <Button variant="primary" onClick={() => navigate("/app/new")} icon={<Plus className="size-3.5" />}>
                  Compare this area
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-[12.5px] leading-relaxed text-muted">
                {draft && draft.length > 2
                  ? `${draft.length} corners placed. Double-click or press Enter to close the polygon.`
                  : "Use the rectangle or polygon tool, or click a point. Coordinates update as you move."}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_AREAS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => mapRef.current?.flyTo([preset.center[1], preset.center[0]], preset.zoom ?? 11)}
                    className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Saved regions"
            description={`${regions.data?.total ?? 0} monitoring ${(regions.data?.total ?? 0) === 1 ? "region" : "regions"}`}
            action={<LocateFixed className="size-4 text-muted" />}
          />
          <div className="mt-4">
          {regions.isLoading ? (
            <p className="text-[12px] text-muted">Loading regions…</p>
          ) : (regions.data?.items.length ?? 0) === 0 ? (
            <p className="text-[12px] leading-relaxed text-muted">
              No regions saved yet. Draw an area and save it to reuse the same footprint across comparisons.
            </p>
          ) : (
            <ul className="max-h-[132px] space-y-1 overflow-y-auto pr-1">
              {regions.data?.items.map((region) => (
                <li key={region.id}>
                  <button
                    onClick={() => region.center && goTo(region.center as [number, number], 12)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-ink">{region.name}</span>
                      <span className="block text-[10px] text-muted">
                        {region.areaKm2 ? formatArea(region.areaKm2) : "Area unknown"}
                      </span>
                    </span>
                    <Badge tone="neutral">Go</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
