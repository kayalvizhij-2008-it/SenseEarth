import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Cpu,
  Download,
  Expand,
  FileSpreadsheet,
  FileText,
  Layers,
  Maximize2,
  Package,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, mediaUrl } from "@/api/client";
import { BeforeAfter } from "@/components/BeforeAfter";
import {
  Badge,
  Button,
  ClassLegend,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Panel,
  PanelHeader,
  ProgressBar,
  Segmented,
  Stat,
  StatusBadge,
  Swatch,
} from "@/components/ui";
import { CosmicOrb } from "@/components/visuals/CosmicOrb";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { STAGE_COPY } from "@/lib/classes";
import {
  formatArea,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  relativeTime,
} from "@/lib/format";
import { formatCoords } from "@/lib/geo";
import { toast } from "@/store/ui";

type Layer = "compare" | "mask" | "semantic" | "overlay";

const LAYER_LABELS: Record<Layer, string> = {
  compare: "Before / after",
  mask: "Change mask",
  semantic: "Semantic classes",
  overlay: "Overlay",
};

function RunningPanel({
  progress,
  stage,
  status,
  error,
  onRetry,
  retrying,
}: {
  progress: number;
  stage: string;
  status: string;
  error?: string | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (status === "failed") {
    return (
      <Panel className="border-danger/30">
        <ErrorState
          title="This analysis failed"
          message={error ?? "The worker reported a failure without a message."}
          action={
            <Button variant="outline" size="sm" loading={retrying} onClick={onRetry} icon={<RefreshCw className="size-3.5" />}>
              Retry with the same images
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel className="relative overflow-hidden">
      <div className="se-scan-line pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/12 to-transparent" />
      <div className="relative flex flex-col gap-6 py-4 sm:flex-row sm:items-center">
        <div className="relative mx-auto flex size-32 shrink-0 items-center justify-center sm:mx-0">
          <span className="absolute inset-0 rounded-full border border-primary/20" />
          <span className="absolute inset-3 rounded-full border border-dashed border-primary/30" />
          <span className="absolute inset-6 rounded-full border border-primary/15" />
          <span className="absolute inset-9 rounded-full bg-primary/10 blur-md" />
          <span className="font-mono text-[22px] text-primary">{Math.round(progress)}%</span>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status as "queued" | "processing"} />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              job running on the api worker
            </span>
          </div>
          <div>
            <h2 className="text-[18px] font-medium text-ink">
              {STAGE_COPY[stage] ?? "Processing the image pair"}
            </h2>
            <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-muted">
              The checkpoint runs on the backend, so you can leave this page. Progress is read from the
              job record every 1.2 seconds.
            </p>
          </div>
          <ProgressBar value={progress} sheen />
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge tone="neutral" mono>{stage}</Badge>
            <Badge tone="neutral" mono>polling /status</Badge>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function ResultsPage() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [layer, setLayer] = useState<Layer>("compare");
  const [opacity, setOpacity] = useState(82);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const detail = useQuery({
    queryKey: ["analysis", analysisId],
    queryFn: () => api.getAnalysis(analysisId as string),
    enabled: Boolean(analysisId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 1200;
    },
  });

  const completed = detail.data?.status === "completed";

  const results = useQuery({
    queryKey: ["results", analysisId],
    queryFn: () => api.results(analysisId as string),
    enabled: Boolean(analysisId) && completed,
  });

  useEffect(() => {
    if (completed) {
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["recent"] });
    }
  }, [completed, queryClient]);

  useDocumentTitle(detail.data?.title ?? "Analysis results");

  const retry = useMutation({
    mutationFn: () => api.retry(analysisId as string),
    onSuccess: () => {
      toast("info", "Re-queued", "The worker will pick the job up again.");
      void queryClient.invalidateQueries({ queryKey: ["analysis", analysisId] });
    },
    onError: (error) => toast("error", "Retry failed", error instanceof ApiError ? error.message : undefined),
  });

  const remove = useMutation({
    mutationFn: () => api.removeAnalysis(analysisId as string),
    onSuccess: () => {
      toast("success", "Analysis deleted", "Stored images and artifacts were removed.");
      void queryClient.invalidateQueries();
      navigate("/app/reports");
    },
    onError: (error) => toast("error", "Delete failed", error instanceof ApiError ? error.message : undefined),
  });

  const download = async (format: "pdf" | "csv" | "zip") => {
    try {
      await api.downloadReport(analysisId as string, format);
      toast("success", `${format.toUpperCase()} downloaded`);
    } catch (error) {
      toast("error", "Download failed", error instanceof ApiError ? error.message : undefined);
    }
  };

  if (!analysisId) {
    return <EmptyState title="No analysis selected" description="Open a run from the history." />;
  }

  const analysis = results.data?.analysis ?? detail.data;
  const statistics = results.data?.statistics;

  if (detail.isError) {
    const status = detail.error instanceof ApiError ? detail.error.status : 0;
    return (
      <ErrorState
        title={status === 404 ? "Analysis not found" : "Could not load this analysis"}
        message={
          status === 404
            ? "It may have been deleted, or it belongs to another account."
            : detail.error instanceof Error
              ? detail.error.message
              : undefined
        }
        action={
          <Button to="/app/reports" variant="outline" size="sm">
            Back to history
          </Button>
        }
      />
    );
  }

  const imageBefore = mediaUrl(analysis?.thumbnails.before);
  const imageAfter = mediaUrl(analysis?.thumbnails.after);
  const maskSrc = mediaUrl(analysis?.artifacts.binaryMask);
  const semanticSrc = mediaUrl(analysis?.artifacts.semanticRgb);
  const overlaySrc = mediaUrl(analysis?.artifacts.overlay);

  const activeSrc =
    layer === "mask" ? maskSrc : layer === "semantic" ? semanticSrc : layer === "overlay" ? overlaySrc : "";

  return (
    <div className="relative space-y-6">
      <div className="pointer-events-none absolute right-6 top-20 hidden opacity-60 lg:block">
        <CosmicOrb className="size-[110px]" rings={false} particles={false} interactive={false} speed={0.5} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <Link to="/app/reports" className="flex items-center gap-1 transition-colors hover:text-ink">
          <ArrowLeft className="size-3.5" /> History
        </Link>
        <span className="text-muted/40">/</span>
        <span className="font-mono text-[10.5px] text-muted">{analysisId}</span>
      </div>

      <PageHeader
        eyebrow={analysis?.status === "completed" ? "Analysis complete" : "Analysis"}
        title={analysis?.title ?? "Loading analysis…"}
        description={
          analysis
            ? `${analysis.locationName ?? "No location"} · ${formatDate(analysis.dateBefore)} → ${formatDate(analysis.dateAfter)} · ${formatCoords(analysis.latitude, analysis.longitude)}`
            : undefined
        }
        actions={
          analysis && (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={analysis.status} />
              {analysis.status === "completed" && (
                <>
                  <Button size="sm" variant="secondary" icon={<Sparkles className="size-3.5" />} to={`/app/insights/${analysis.id}`}>
                    Insights
                  </Button>
                  <Button size="sm" variant="primary" icon={<FileText className="size-3.5" />} onClick={() => download("pdf")}>
                    PDF report
                  </Button>
                  <Button size="sm" variant="ghost" icon={<FileSpreadsheet className="size-3.5" />} onClick={() => download("csv")}>
                    CSV
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Package className="size-3.5" />} onClick={() => download("zip")}>
                    Bundle
                  </Button>
                </>
              )}
              <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(true)} aria-label="Delete analysis" />
            </div>
          )
        }
      />

      {analysis?.engine === "spectral_baseline" && (
        <div className="flex items-start gap-2 rounded-xl border border-warn/35 bg-warn/[0.07] px-4 py-3 text-[12px] leading-relaxed text-warn">
          <TriangleAlert className="mt-px size-4 shrink-0" />
          This result came from the spectral-difference fallback, not the SenseEarth network. Class
          labels are unavailable in baseline mode.
        </div>
      )}

      {!completed && analysis && (
        <RunningPanel
          progress={detail.data?.progress ?? 0}
          stage={detail.data?.stage ?? "queued"}
          status={analysis.status}
          error={analysis.error}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending}
        />
      )}

      {completed && results.isLoading && <Panel><p className="text-[12.5px] text-muted">Loading stored results…</p></Panel>}

      {completed && results.isError && (
        <ErrorState
          message={results.error instanceof Error ? results.error.message : undefined}
          onRetry={() => results.refetch()}
        />
      )}

      {completed && statistics && analysis && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Changed pixels"
              value={formatNumber(statistics.changedPixels)}
              hint={`${formatPercent(statistics.changeRatio, 2)} of ${formatNumber(statistics.pixels)} pixels`}
              icon={<Target className="size-4" />}
              tone="primary"
            />
            <Stat
              label="Changed area"
              value={formatArea(statistics.changedAreaKm2)}
              hint={
                statistics.areaSource === "none"
                  ? "No AOI supplied — pixels only"
                  : `AOI source · ${statistics.areaSource}`
              }
              icon={<Layers className="size-4" />}
              tone="success"
            />
            <Stat
              label="Class transitions"
              value={statistics.transitions.length}
              hint={statistics.changedClasses.map((entry) => entry.label).slice(0, 3).join(" · ") || "No changed classes"}
              icon={<ArrowRight className="size-4" />}
            />
            <Stat
              label="Inference time"
              value={formatDuration(analysis.inferenceMs)}
              hint={`${analysis.device ?? "cpu"} · ${analysis.modelName ?? "model"}`}
              icon={<Cpu className="size-4" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Panel className="flex flex-col">
              <PanelHeader
                title="Result viewer"
                description="Every layer is the artifact the backend wrote for this run."
                action={
                  <div className="flex items-center gap-2">
                    <Segmented
                      value={layer}
                      onChange={setLayer}
                      items={[
                        { value: "compare", label: "Pair" },
                        { value: "mask", label: "Mask" },
                        { value: "semantic", label: "Semantic" },
                        { value: "overlay", label: "Overlay" },
                      ]}
                    />
                    <button
                      onClick={() => setLightbox(true)}
                      className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:text-ink"
                      aria-label="Open layer fullscreen"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                  </div>
                }
              />

              <div className="mt-4 overflow-hidden rounded-xl border border-line bg-bg-deep">
                <div className="relative aspect-[4/3] w-full">
                  {layer === "compare" ? (
                    <BeforeAfter
                      beforeSrc={imageBefore}
                      afterSrc={imageAfter}
                      beforeLabel={analysis.dateBefore ?? "Before"}
                      afterLabel={analysis.dateAfter ?? "After"}
                      className="absolute inset-0 size-full"
                      rounded="rounded-none"
                    />
                  ) : (
                    <>
                      <img src={imageAfter} alt="Later acquisition" className="absolute inset-0 size-full object-cover opacity-40" />
                      <img
                        src={activeSrc}
                        alt={LAYER_LABELS[layer]}
                        className="absolute inset-0 size-full object-cover"
                        style={{ opacity: layer === "overlay" ? opacity / 100 : 1, imageRendering: "pixelated" }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(LAYER_LABELS) as Layer[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => setLayer(option)}
                      className={clsx(
                        "rounded-md border px-2 py-1 text-[10.5px] transition-colors",
                        layer === option
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-line text-muted hover:text-ink-soft",
                      )}
                    >
                      {LAYER_LABELS[option]}
                    </button>
                  ))}
                </div>
                {layer === "overlay" && (
                  <label className="flex items-center gap-2 text-[10.5px] text-muted">
                    opacity
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={opacity}
                      onChange={(event) => setOpacity(Number(event.target.value))}
                      className="h-1 w-28 accent-[var(--se-primary)]"
                    />
                    <span className="w-8 font-mono">{opacity}%</span>
                  </label>
                )}
              </div>

              <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                    Predicted classes in changed pixels
                  </p>
                  <ClassLegend
                    showValues
                    includeUnchanged={false}
                    size="sm"
                    className="grid-cols-1"
                    values={new Map(statistics.changedClasses.map((entry) => [entry.id, entry.pixels]))}
                  />
                </div>
                <div>
                  <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                    Class transitions
                  </p>
                  {statistics.transitions.length === 0 ? (
                    <p className="text-[11.5px] text-muted">No changed pixels — nothing to attribute.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {statistics.transitions.slice(0, 5).map((transition) => (
                        <li
                          key={`${transition.from.id}-${transition.to.id}`}
                          className="flex items-center gap-2 text-[11.5px]"
                        >
                          <Swatch hex={transition.from.hex} />
                          <span className="text-muted">{transition.from.label}</span>
                          <ArrowRight className="size-3 text-muted/60" />
                          <Swatch hex={transition.to.hex} />
                          <span className="text-ink-soft">{transition.to.label}</span>
                          <span className="ml-auto font-mono text-[10.5px] text-muted">
                            {formatPercent(transition.ratio, 1)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel>
                <PanelHeader title="Measurements" description="Derived from the stored masks only." />
                <dl className="mt-4 space-y-2.5 text-[12px]">
                  {[
                    ["Total pixels", formatNumber(statistics.pixels)],
                    ["Changed", formatNumber(statistics.changedPixels)],
                    ["Unchanged", formatNumber(statistics.unchangedPixels)],
                    ["Change ratio", formatPercent(statistics.changeRatio, 3)],
                    ["Analysed area", formatArea(statistics.areaKm2)],
                    ["Changed area", formatArea(statistics.changedAreaKm2)],
                    ["Pixel area", statistics.pixelAreaM2 ? `${formatNumber(statistics.pixelAreaM2, 1)} m²` : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-2 last:border-0 last:pb-0">
                      <dt className="text-muted">{label}</dt>
                      <dd className="font-mono text-[11.5px] text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel>
                <PanelHeader title="Run metadata" icon={<Clock className="size-4" />} />
                <dl className="mt-4 space-y-2 text-[11.5px]">
                  {[
                    ["Engine", analysis.engineLabel ?? analysis.engine ?? "—"],
                    ["Model", analysis.modelName ?? "—"],
                    ["Device", analysis.device ?? "—"],
                    ["Input", analysis.width && analysis.height ? `${analysis.width} × ${analysis.height}` : "—"],
                    ["Created", formatDate(analysis.createdAt, true)],
                    ["Completed", relativeTime(analysis.completedAt)],
                    ["Artifacts", `${Object.values(analysis.artifacts).filter(Boolean).length} files`],
                  ].map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5 last:border-0">
                      <dt className="text-muted">{key}</dt>
                      <dd className="max-w-[62%] truncate text-right font-mono text-[10.5px] text-ink-soft" title={value}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={() => download("pdf")} aria-label="Download PDF" />
                  <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="size-3.5" />} onClick={() => download("csv")} aria-label="Download CSV" />
                  <Button variant="secondary" size="sm" icon={<Package className="size-3.5" />} onClick={() => download("zip")} aria-label="Download bundle" />
                </div>
              </Panel>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Panel>
              <PanelHeader title="Class table" description="Pixels the model assigned after the change." />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-[11.5px]">
                  <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="pb-2 font-medium">Class</th>
                      <th className="pb-2 text-right font-medium">Pixels</th>
                      <th className="pb-2 text-right font-medium">Share</th>
                      <th className="pb-2 text-right font-medium">Area</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics.classes
                      .filter((entry) => entry.id !== 0)
                      .map((entry) => (
                        <tr key={entry.id} className="border-b border-line/50 last:border-0">
                          <td className="py-2">
                            <span className="flex items-center gap-2 text-ink-soft">
                              <Swatch hex={entry.hex} />
                              {entry.label}
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono text-ink">{formatNumber(entry.pixels)}</td>
                          <td className="py-2 text-right font-mono text-muted">{formatPercent(entry.ratio, 3)}</td>
                          <td className="py-2 text-right font-mono text-muted">{formatArea(entry.areaKm2 ?? null)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Method & caveats" icon={<TriangleAlert className="size-4" />} />
              <div className="mt-4 space-y-3 text-[12px] leading-relaxed text-muted">
                <p>
                  Change is decided by the model's unchanged channel: pixels whose unchanged probability
                  is at or below 0.5 are flagged. Semantic labels come from the arg-max class of the
                  six-channel head.
                </p>
                {statistics.areaSource === "none" && (
                  <p className="rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[11.5px] text-warn">
                    No geographic boundary was attached, so areas are reported in pixels only.
                  </p>
                )}
                {statistics.warnings.map((warning) => (
                  <p key={warning} className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[11.5px]">
                    {warning}
                  </p>
                ))}
                <p className="text-[11px]">
                  Exports: PDF (reportlab summary), CSV (class and transition table) and ZIP (masks plus
                  images). All files are generated from this run's stored artifacts.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge tone="neutral" mono>argmax + 1</Badge>
                  <Badge tone="neutral" mono>threshold 0.5</Badge>
                  <Badge tone="neutral" mono>
                    {analysis.width ?? "?"}×{analysis.height ?? "?"}
                  </Badge>
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}

      <Modal
        open={lightbox}
        onClose={() => setLightbox(false)}
        title={layer === "compare" ? "Before / after" : LAYER_LABELS[layer]}
        width="max-w-5xl"
        footer={
          <Button variant="ghost" size="sm" onClick={() => setLightbox(false)} icon={<ArrowLeft className="size-3.5" />}>
            Close
          </Button>
        }
      >
        <div className="overflow-hidden rounded-xl border border-line bg-black">
          {layer === "compare" ? (
            <BeforeAfter
              beforeSrc={imageBefore}
              afterSrc={imageAfter}
              beforeLabel={analysis?.dateBefore ?? "Before"}
              afterLabel={analysis?.dateAfter ?? "After"}
              className="aspect-[4/3]"
              rounded="rounded-none"
            />
          ) : (
            <img src={activeSrc} alt={LAYER_LABELS[layer]} className="max-h-[70vh] w-full object-contain" />
          )}
        </div>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
          <Expand className="size-3" /> Artifact served by the API for this analysis only.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this analysis?"
        description="The database row and every stored artifact (uploads, masks, overlays, reports) are removed. This cannot be undone."
        confirmLabel="Delete permanently"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
