import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CircleDot,
  Droplets,
  Info,
  MapPin,
  Plus,
  Radar,
  Sprout,
  TreePine,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/api/client";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
  StatusBadge,
} from "@/components/ui";
import { CosmicOrb } from "@/components/visuals/CosmicOrb";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRegionActivity } from "@/hooks/useSystem";
import { formatArea, formatNumber, formatPercent, relativeTime } from "@/lib/format";
import { formatCoords } from "@/lib/geo";

const GROUP_ICONS: Record<string, typeof Droplets> = {
  water: Droplets,
  vegetation: Sprout,
  ground: CircleDot,
  built: Building2,
  sports: Radar,
};

const GROUP_COLORS: Record<string, string> = {
  water: "#38BDF8",
  vegetation: "#34D399",
  ground: "#A8A29E",
  built: "#FB7185",
  sports: "#F472B6",
};

export default function MonitoringPage() {
  useDocumentTitle("Environmental monitoring");
  const activity = useRegionActivity();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const regions = useMemo(() => activity.data?.regions ?? [], [activity.data]);
  const selected = useMemo(
    () => regions.find((region) => region.id === selectedId) ?? regions[0] ?? null,
    [regions, selectedId],
  );

  const completedChanges = useMemo(
    () => (selected?.changes ?? []).filter((change) => change.status === "completed").map((change) => change.id),
    [selected],
  );

  const compare = useQuery({
    queryKey: ["compare", completedChanges.join(",")],
    queryFn: () => api.compare(completedChanges.slice(0, 6)),
    enabled: completedChanges.length > 0,
    staleTime: 30_000,
  });

  const trend = useMemo(() => {
    if (!selected) return [];
    return [...selected.changes]
      .reverse()
      .filter((change) => change.status === "completed")
      .map((change) => ({
        label: change.dateAfter ?? new Date(change.completedAt ?? "").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ratio: Number(((change.changeRatio ?? 0) * 100).toFixed(3)),
        id: change.id,
      }));
  }, [selected]);

  const groups = useMemo(() => {
    const totals = new Map<string, { pixels: number; area: number }>();
    for (const item of compare.data?.items ?? []) {
      for (const group of item.groups) {
        const current = totals.get(group.key) ?? { pixels: 0, area: 0 };
        totals.set(group.key, {
          pixels: current.pixels + group.pixels,
          area: current.area + group.areaKm2,
        });
      }
    }
    return totals;
  }, [compare.data]);

  const totalMonitoredRuns = regions.reduce((sum, region) => sum + region.analysisCount, 0);
  const latestCompletion = regions
    .map((region) => region.latestAnalysis?.completedAt ?? null)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="space-y-5">
      <PageHeader
        visual={<CosmicOrb className="size-[64px]" rings particles={false} interactive={false} speed={0.55} />}
        eyebrow="Watchlist"
        title="Environmental monitoring"
        description="Regions you saved, with the change signal from the analyses already stored against them."
        actions={
          <Button to="/app/explore" variant="primary" icon={<Plus className="size-4" />}>
            Save a region
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface/60 px-4 py-3 text-[11.5px] leading-relaxed text-muted">
        <Info className="mt-px size-3.5 shrink-0 text-primary/80" />
        <span>
          This build does not ingest a live satellite feed. Monitoring groups the analyses <em>you</em>{" "}
          run against saved regions, so every trend below is traceable to a stored mask. No automatic
          alerts are sent.
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Monitored regions" value={regions.length} icon={<MapPin className="size-4" />} tone="primary" hint="Saved from the map" />
        <Stat label="Runs in regions" value={totalMonitoredRuns} icon={<Activity className="size-4" />} hint="Across all watchlist regions" />
        <Stat
          label="Latest signal"
          value={selected?.latestAnalysis?.changeRatio !== null && selected?.latestAnalysis ? formatPercent(selected.latestAnalysis.changeRatio, 2) : "—"}
          icon={<Radar className="size-4" />}
          hint={selected ? selected.name : "Select a region"}
          tone="success"
        />
        <Stat
          label="Last completed"
          value={latestCompletion ? relativeTime(latestCompletion) : "Never"}
          icon={<CircleDot className="size-4" />}
          hint="Newest completed run in the watchlist"
        />
      </div>

      {activity.isLoading ? (
        <Panel>
          <p className="text-[12.5px] text-muted">Loading regions…</p>
        </Panel>
      ) : regions.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Radar className="size-5" />}
            title="No regions under watch"
            description="Save an area of interest from Explore Earth. Analyses that reference it will collect here with their change history."
            action={
              <Button to="/app/explore" variant="primary" size="sm" icon={<MapPin className="size-3.5" />}>
                Open Explore Earth
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <div className="space-y-2">
            {regions.map((region) => {
              const active = selected?.id === region.id;
              return (
                <button
                  key={region.id}
                  onClick={() => setSelectedId(region.id)}
                  className={clsx(
                    "w-full rounded-xl border p-3.5 text-left transition-colors",
                    active
                      ? "border-primary/40 bg-primary/[0.06]"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
                        <MapPin className={clsx("size-3.5 shrink-0", active ? "text-primary" : "text-muted")} />
                        {region.name}
                      </p>
                      <p className="mt-0.5 truncate text-[10.5px] text-muted">
                        {region.center ? formatCoords(region.center[1], region.center[0]) : "No centre"} ·{" "}
                        {formatArea(region.areaKm2)}
                      </p>
                    </div>
                    <Badge tone={active ? "primary" : "neutral"} mono>
                      {region.analysisCount}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {region.latestAnalysis ? (
                      <>
                        <StatusBadge status={region.latestAnalysis.status} />
                        <span className="font-mono text-[10.5px] text-muted">
                          {formatPercent(region.latestAnalysis.changeRatio, 2)} ·{" "}
                          {relativeTime(region.latestAnalysis.completedAt)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10.5px] text-muted">No analyses yet</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="space-y-4">
              <Panel>
                <PanelHeader
                  title={`${selected.name} · change trend`}
                  description={`${trend.length} completed ${trend.length === 1 ? "run" : "runs"} with a stored change ratio.`}
                  action={
                    selected.latestAnalysis && (
                      <Button
                        to={`/app/results/${selected.latestAnalysis.id}`}
                        variant="secondary"
                        size="sm"
                        iconRight={<ArrowUpRight className="size-3.5" />}
                      >
                        Latest result
                      </Button>
                    )
                  }
                />
                <div className="mt-4 h-[220px]">
                  {trend.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                      <p className="text-[12.5px] text-muted">No completed runs for this region yet.</p>
                      <Button to="/app/new" variant="outline" size="sm">
                        Run the first comparison
                      </Button>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke="var(--se-line)" strokeDasharray="3 5" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "var(--se-muted)", fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value: string) => value.slice(0, 10)}
                        />
                        <YAxis
                          tick={{ fill: "var(--se-muted)", fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={48}
                          tickFormatter={(value: number) => `${value}%`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--se-surface)",
                            border: "1px solid var(--se-line)",
                            borderRadius: 10,
                            fontSize: 11,
                            color: "var(--se-ink)",
                          }}
                          formatter={(value: number) => [`${value}%`, "changed"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="ratio"
                          stroke="#34D399"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "#34D399", strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                  <PanelHeader
                    title="Changed classes"
                    description="Aggregated across this region's latest completed runs."
                    icon={<TreePine className="size-4" />}
                  />
                  <div className="mt-4 space-y-3">
                    {groups.size === 0 ? (
                      <p className="text-[12px] leading-relaxed text-muted">
                        No comparable results yet. Group statistics appear once a run in this region
                        completes.
                      </p>
                    ) : (
                      [...groups.entries()]
                        .sort((a, b) => b[1].pixels - a[1].pixels)
                        .map(([key, value]) => {
                          const Icon = GROUP_ICONS[key] ?? CircleDot;
                          const max = Math.max(...[...groups.values()].map((entry) => entry.pixels), 1);
                          return (
                            <div key={key} className="space-y-1.5">
                              <div className="flex items-center gap-2 text-[11.5px]">
                                <Icon className="size-3.5" style={{ color: GROUP_COLORS[key] }} />
                                <span className="capitalize text-ink-soft">{key}</span>
                                <span className="ml-auto font-mono text-[10.5px] text-muted">
                                  {formatNumber(value.pixels)} px · {formatArea(value.area)}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max((value.pixels / max) * 100, 2)}%`,
                                    backgroundColor: GROUP_COLORS[key] ?? "#22D3EE",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </Panel>

                <Panel>
                  <PanelHeader title="Run history" description="Newest first, as stored for this region." />
                  <ul className="mt-4 space-y-2">
                    {(selected.changes.length === 0
                      ? []
                      : selected.changes
                    ).map((change) => (
                      <li key={change.id} className="flex items-center gap-2 border-b border-line/60 pb-2 last:border-0">
                        <StatusBadge status={change.status} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] text-ink-soft">{change.title}</p>
                          <p className="text-[10px] text-muted">
                            {change.dateAfter ?? "no date"} · {relativeTime(change.completedAt)}
                          </p>
                        </div>
                        <span className="font-mono text-[10.5px] text-muted">
                          {formatPercent(change.changeRatio, 2)}
                        </span>
                        <Button
                          to={`/app/results/${change.id}`}
                          variant="ghost"
                          size="sm"
                          aria-label="Open result"
                          icon={<ArrowUpRight className="size-3.5" />}
                        />
                      </li>
                    ))}
                    {selected.changes.length === 0 && (
                      <li className="text-[11.5px] text-muted">Nothing recorded for this region yet.</li>
                    )}
                  </ul>
                </Panel>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
