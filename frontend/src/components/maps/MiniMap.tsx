import clsx from "clsx";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { gibsDefaultDate } from "@/lib/mapStyle";

/**
 * A compact, non-interactive context map. It shares the same keyless NASA GIBS
 * tiles as Explore Earth; the lime ring marks the highlighted footprint.
 */
export function MiniMap({
  center = [21.2, 78.9] as [number, number],
  zoom = 4,
  ring,
  className,
}: {
  center?: [number, number];
  zoom?: number;
  ring?: Array<[number, number]> | null;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const map = L.map(host, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      center,
      zoom,
    });
    L.tileLayer(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${gibsDefaultDate()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      { maxNativeZoom: 9, maxZoom: 17, crossOrigin: true, className: "se-tiles-satellite" },
    ).addTo(map);
    if (ring && ring.length > 2) {
      L.polygon(ring.map(([lng, lat]) => [lat, lng]), {
        color: "#c6f36b",
        weight: 1.5,
        fillColor: "#c6f36b",
        fillOpacity: 0.1,
        dashArray: "4 4",
        interactive: false,
      }).addTo(map);
    }
    window.setTimeout(() => map.invalidateSize(), 160);
    return () => {
      map.remove();
    };
  }, [center, zoom, ring]);

  return (
    <div className={clsx("relative overflow-hidden rounded-xl border border-line", className)}>
      <div ref={hostRef} className="size-full" aria-label="Satellite context map" />
      <span className="pointer-events-none absolute bottom-1 right-1.5 z-[500] font-mono text-[8px] uppercase tracking-[0.1em] text-ivory/70">
        NASA GIBS · MODIS Terra
      </span>
    </div>
  );
}
