import clsx from "clsx";
import {
  ArrowUpRight,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Region } from "@/api/types";
import { MiniMap } from "@/components/maps/MiniMap";
import { Badge, Button } from "@/components/ui";
import { formatArea, relativeTime } from "@/lib/format";
import { formatCoords } from "@/lib/geo";

export function regionRing(region: Region): Array<[number, number]> | null {
  const geometry = region.geometry as {
    type?: string;
    coordinates?: unknown;
  } | null;
  if (geometry?.type === "Polygon") {
    const ring = (geometry.coordinates as number[][][])?.[0];
    return ring?.length ? (ring as Array<[number, number]>) : null;
  }
  if (geometry?.type === "MultiPolygon") {
    const ring = (geometry.coordinates as number[][][][])?.[0]?.[0];
    return ring?.length ? (ring as Array<[number, number]>) : null;
  }
  if (region.bbox) {
    const [west, south, east, north] = region.bbox;
    return [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ];
  }
  return null;
}

export function RegionCard({
  region,
  onEdit,
  onRemove,
  onToggleMonitoring,
  showMap = true,
  selected = false,
}: {
  region: Region;
  onEdit?: (region: Region) => void;
  onRemove?: (region: Region) => void;
  onToggleMonitoring?: (region: Region) => void;
  showMap?: boolean;
  selected?: boolean;
}) {
  const ring = regionRing(region);
  const paused = region.monitoringStatus === "paused";
  const lastChecked =
    region.lastCheckedAt ??
    region.latestAnalysis?.completedAt ??
    null;

  return (
    <article
      className={clsx(
        "group overflow-hidden rounded-xl border bg-surface transition-colors",
        selected
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-line hover:border-line-strong",
      )}
    >
      {showMap && ring && (
        <MiniMap
          center={
            region.center
              ? [region.center[1], region.center[0]]
              : [
                  ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
                  ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
                ]
          }
          zoom={11}
          ring={ring}
          className="h-[112px] rounded-none border-x-0 border-t-0"
        />
      )}
      <div className="space-y-3 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-medium text-ink">
              {region.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted">
              {region.center
                ? formatCoords(region.center[1], region.center[0])
                : "Boundary saved"}
              {region.areaKm2 ? ` · ${formatArea(region.areaKm2)}` : ""}
            </p>
          </div>
          <Badge tone={paused ? "warning" : "success"} dot>
            {paused ? "Paused" : "Active"}
          </Badge>
        </div>

        {region.description && (
          <p className="line-clamp-2 text-[11.5px] leading-relaxed text-muted">
            {region.description}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-2.5 text-[10.5px] text-muted">
          <span>
            {region.analysisCount > 0
              ? `${region.analysisCount} ${region.analysisCount === 1 ? "analysis" : "analyses"}`
              : "No analyses yet"}
          </span>
          <span>{lastChecked ? `Checked ${relativeTime(lastChecked)}` : "Not checked"}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            to={`/app/monitoring?region=${region.id}`}
            variant="secondary"
            size="sm"
            className="flex-1"
            iconRight={<ArrowUpRight className="size-3.5" />}
          >
            Open
          </Button>
          {onToggleMonitoring && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleMonitoring(region)}
              aria-label={paused ? `Resume monitoring ${region.name}` : `Pause monitoring ${region.name}`}
              title={paused ? "Resume monitoring" : "Pause monitoring"}
              icon={paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            />
          )}
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(region)}
              aria-label={`Edit ${region.name}`}
              title="Edit region"
              icon={<Pencil className="size-3.5" />}
            />
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(region)}
              aria-label={`Remove ${region.name}`}
              title="Remove region"
              icon={<Trash2 className="size-3.5" />}
            />
          )}
        </div>
      </div>
    </article>
  );
}

export function RegionStatusLink({ region }: { region: Region }) {
  return (
    <Link
      to={`/app/monitoring?region=${region.id}`}
      className="text-[11px] text-primary hover:underline"
    >
      Open in monitoring
    </Link>
  );
}
