import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  ImageOff,
  Layers,
  MapPin,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { mediaUrl } from "@/api/client";
import type { Analysis } from "@/api/types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  PanelHeader,
  Segmented,
  Stat,
  StatusBadge,
} from "@/components/ui";
import { CosmicOrb } from "@/components/visuals/CosmicOrb";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  useClassDistribution,
  useHealth,
  useHistory,
  useModelStatus,
  useRecentAnalyses,
  useSummary,
} from "@/hooks/useSystem";
import { formatArea, formatCompact, formatPercent, relativeTime } from "@/lib/format";
import { useAuthStore } from "@/store/auth";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <p key={entry.dataKey} className="flex items-center gap-2 text-[11.5px] text-ink-soft">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="capitalize">{entry.name}</span>
            <span className="ml-auto font-mono text-ink">{formatCompact(entry.value ?? 0)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function RecentRow({ analysis }: { analysis: Analysis }) {
  const thumb = mediaUrl(analysis.thumbnails.after);
  return (
    <Link
      to={`/app/results/${analysis.id}`}
      className="group grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-line hover:bg-surface-2/60"
    >
      <div className="relative size-[42px] overflow-hidden rounded-lg border border-line bg-bg-deep">
        {thumb ? (
          <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted">
            <ImageOff className="size-4" />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium text-ink group-hover:text-primary">{analysis.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
          {analysis.locationName ?? "No location"}
          <span className="text-muted/50">·</span>
          {relativeTime(analysis.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-right sm:block">
          <span className="block font-mono text-[12px] text-ink-soft">
            {formatPercent(analysis.changeRatio, 2)}
          </span>
          <span className="block text-[10px] text-muted">{formatArea(analysis.areaKm2)}</span>
        </span>
        <StatusBadge status={analysis.status} />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  useDocumentTitle("Dashboard");
  const user = useAuthStore((state) => state.user);
  const [days, setDays] = useState<"14" | "30" | "90">("30");
  const queryClient = useQueryClient();

  const summary = useSummary();
  const history = useHistory(Number(days));
  const distribution = useClassDistribution();
  const recent = useRecentAnalyses(6);
  const health = useHealth();
  const model = useModelStatus();

  const chartData = (history.data?.points ?? []).map((point) => ({
    date: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    completed: point.completed,
    failed: point.failed,
  }));

  const totalAnalyses = summary.data?.totalAnalyses ?? 0;
  const hasActivity = totalAnalyses > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        visual={<CosmicOrb className="size-[72px]" rings={false} particles={false} interactive={false} speed={0.6} />}
        eyebrow="Workspace"
        title="Your monitored regions, at a glance."
        description={`${user?.name?.split(" ")[0] ?? "Analyst"}, every figure below is computed from stored analyses — no estimates, no placeholders. Change area comes from the AOI attached to each run.`}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className={clsx("size-3.5", summary.isFetching && "animate-spin")} />}
              onClick={() => queryClient.invalidateQueries()}
            >
              Refresh
            </Button>
            <Button to="/app/new" variant="primary" icon={<ScanLine className="size-4" />}>
              New analysis
            </Button>
          </>
        }
      />

      {summary.isError && (
        <ErrorState
          title="The API is not responding"
          message="Start the backend with `python -m uvicorn backend.app.main:app --port 8000`. The dashboard will recover automatically once it answers."
          onRetry={() => queryClient.invalidateQueries()}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Completed analyses"
          value={summary.data?.completed ?? 0}
          hint={
            summary.data
              ? `${summary.data.processing} running · ${summary.data.queued} queued · ${summary.data.failed} failed`
              : undefined
          }
          icon={<CheckCircle2 className="size-4" />}
          loading={summary.isLoading}
          tone="success"
        />
        <Stat
          label="Changed area"
          value={formatArea(summary.data?.totalChangedAreaKm2 ?? 0)}
          hint={summary.data ? `of ${formatArea(summary.data.totalAreaKm2)} analysed` : undefined}
          icon={<Layers className="size-4" />}
          loading={summary.isLoading}
          tone="primary"
        />
        <Stat
          label="Average change"
          value={formatPercent(summary.data?.averageChangeRatio ?? 0, 2)}
          hint="Mean share of changed pixels per completed run"
          icon={<Activity className="size-4" />}
          loading={summary.isLoading}
        />
        <Stat
          label="Monitored regions"
          value={summary.data?.regions ?? 0}
          hint={summary.data?.lastCompletedAt ? `Last run ${relativeTime(summary.data.lastCompletedAt)}` : "No completed run yet"}
          icon={<MapPin className="size-4" />}
          loading={summary.isLoading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Panel className="flex flex-col">
          <PanelHeader
            title="Analysis activity"
            description="Runs per day, from the records the API actually stored."
            action={
              <Segmented
                value={days}
                onChange={setDays}
                items={[
                  { value: "14", label: "14d" },
                  { value: "30", label: "30d" },
                  { value: "90", label: "90d" },
                ]}
              />
            }
          />
          <div className="mt-5 h-[248px] w-full">
            {history.isLoading ? (
              <LoadingBlock rows={4} />
            ) : !hasActivity ? (
              <div className="flex h-full items-center justify-center">
                <p className="max-w-xs text-center text-[12.5px] leading-relaxed text-muted">
                  The activity chart fills in after your first analysis completes.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="failedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F87171" stopOpacity={0.26} />
                      <stop offset="100%" stopColor="#F87171" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--se-line)" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--se-muted)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={26}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--se-muted)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--se-line-strong)" }} />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    stroke="#22D3EE"
                    strokeWidth={1.8}
                    fill="url(#completedFill)"
                    name="Completed"
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="#F87171"
                    strokeWidth={1.4}
                    fill="url(#failedFill)"
                    name="Failed"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel className="flex flex-col">
          <PanelHeader
            title="Class mix"
            description="Aggregated semantic pixels across completed runs."
            action={<Badge tone="neutral" mono>{distribution.data?.analysesConsidered ?? 0} runs</Badge>}
          />
          <div className="mt-5 flex-1 space-y-3">
            {distribution.isLoading ? (
              <LoadingBlock rows={5} />
            ) : (distribution.data?.totalPixels ?? 0) === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-muted">
                No semantic class pixels stored yet. Run an analysis to populate this mix.
              </p>
            ) : (
              distribution.data?.classes
                .filter((entry) => entry.id !== 0)
                .map((entry) => {
                  const percent = entry.ratio * 100;
                  return (
                    <div key={entry.id} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-[11.5px]">
                        <span
                          className="size-2.5 rounded-[2px] border border-white/25"
                          style={{ backgroundColor: entry.hex }}
                        />
                        <span className="text-ink-soft">{entry.label}</span>
                        <span className="ml-auto font-mono text-[10.5px] text-muted">
                          {formatPercent(entry.ratio, 2)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.max(percent, percent > 0 ? 1.5 : 0)}%`,
                            backgroundColor: entry.hex,
                            boxShadow: `0 0 12px ${entry.hex}55`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted">
            {distribution.data?.note ?? "Class shares are pixel ratios, not area percentages."}
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Panel>
          <PanelHeader
            title="Recent analyses"
            description="Newest runs first, including jobs that are still processing."
            action={
              <Link
                to="/app/reports"
                className="flex items-center gap-1 text-[11.5px] text-primary transition-opacity hover:opacity-80"
              >
                View all <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          <div className="mt-4 space-y-1">
            {recent.isLoading ? (
              <LoadingBlock rows={4} />
            ) : (recent.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                icon={<ScanLine className="size-5" />}
                title="No analyses yet"
                description="Upload a bi-temporal pair, or start from the demo pair bundled with the project."
                action={
                  <Button to="/app/new" variant="primary" size="sm">
                    Start an analysis
                  </Button>
                }
                className="mt-2"
              />
            ) : (
              recent.data?.items.map((analysis) => <RecentRow key={analysis.id} analysis={analysis} />)
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Inference engine"
            description="The same checkpoint the research code loads."
            icon={<Cpu className="size-4" />}
          />
          <dl className="mt-4 space-y-2.5 text-[12px]">
            {[
              ["Model", model.data?.name ?? health.data?.model.name ?? "—"],
              ["Device", model.data?.device ?? "—"],
              ["Weights", model.data?.weightsPresent ? "present" : "missing"],
              ["Parameters", model.data?.parameters ? `${(model.data.parameters / 1e6).toFixed(1)} M` : "—"],
              ["Classes", model.data?.numSemanticClasses ? String(model.data.numSemanticClasses) : "—"],
              ["Fallback", model.data?.baselineFallbackEnabled ? "spectral baseline allowed" : "disabled"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line/60 pb-2 last:border-0">
                <dt className="text-muted">{label}</dt>
                <dd className="truncate font-mono text-[11px] text-ink-soft">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={health.data?.database === "ok" ? "success" : "warning"} dot>
              DB {health.data?.database ?? "unknown"}
            </Badge>
            <Badge tone="neutral" mono>
              {health.data?.queue.active ?? 0}/{health.data?.queue.workers ?? 0} workers
            </Badge>
            <Badge tone="neutral" mono>
              py {health.data?.python ?? "—"}
            </Badge>
          </div>
          <Button to="/app/settings" variant="secondary" size="sm" className="mt-4" full>
            System details
          </Button>
        </Panel>
      </div>
    </div>
  );
}
