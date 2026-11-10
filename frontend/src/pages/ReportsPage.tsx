import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  ImageOff,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, mediaUrl } from "@/api/client";
import type { Analysis, AnalysisStatus } from "@/api/types";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
} from "@/components/ui";
import { CosmicOrb } from "@/components/visuals/CosmicOrb";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { formatArea, formatDate, formatPercent, relativeTime } from "@/lib/format";
import { toast } from "@/store/ui";

type StatusFilter = "all" | AnalysisStatus;

const PAGE_SIZE = 10;

export default function ReportsPage() {
  useDocumentTitle("Reports & history");
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(search);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Analysis | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setParams(search ? { q: search } : {}, { replace: true });
  }, [search, setParams]);

  const history = useQuery({
    queryKey: ["analyses", { debounced, status, sort, dateFrom, dateTo, page }],
    queryFn: () =>
      api.listAnalyses({
        q: debounced || undefined,
        status: status === "all" ? undefined : status,
        sort,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.removeAnalysis(id),
    onSuccess: () => {
      toast("success", "Analysis deleted");
      setPendingDelete(null);
      void queryClient.invalidateQueries();
    },
    onError: (error) =>
      toast("error", "Delete failed", error instanceof ApiError ? error.message : undefined),
  });

  const download = async (analysis: Analysis, format: "pdf" | "csv" | "zip") => {
    try {
      await api.downloadReport(analysis.id, format);
      toast("success", `${format.toUpperCase()} downloaded`, analysis.title);
    } catch (error) {
      toast("error", "Download failed", error instanceof ApiError ? error.message : undefined);
    }
  };

  const total = history.data?.total ?? 0;
  const pages = history.data?.pages ?? 1;
  const counts = history.data?.items.length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        visual={<CosmicOrb className="size-[56px] opacity-80" rings={false} particles={false} interactive={false} speed={0.5} />}
        eyebrow="Archive"
        title="Reports & history"
        description="Every run is stored with its artifacts. Filter the archive, re-open a result, or export the evidence again."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={clsx("size-3.5", history.isFetching && "animate-spin")} />}
            onClick={() => void history.refetch()}
          >
            Refresh
          </Button>
        }
      />

      <Panel padded={false} className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search title, location or id…"
            className="lg:w-80"
          />
          <Tabs
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            items={[
              { value: "all", label: "All" },
              { value: "completed", label: "Completed" },
              { value: "processing", label: "Running" },
              { value: "queued", label: "Queued" },
              { value: "failed", label: "Failed" },
            ]}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1 text-[10.5px] uppercase tracking-[0.12em] text-muted xl:flex">
              <Filter className="size-3" /> range
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-line bg-surface-2 px-2 font-mono text-[11px] text-ink-soft focus:border-primary/50 focus:outline-none"
              aria-label="From date"
            />
            <span className="text-muted/50">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-line bg-surface-2 px-2 font-mono text-[11px] text-ink-soft focus:border-primary/50 focus:outline-none"
              aria-label="To date"
            />
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-9 w-[128px] text-[12px]"
              aria-label="Sort order"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="largest">Largest change</option>
            </Select>
          </div>
        </div>

        {history.isLoading ? (
          <div className="p-4">
            <LoadingBlock rows={6} />
          </div>
        ) : history.isError ? (
          <div className="p-4">
            <ErrorState
              message={history.error instanceof Error ? history.error.message : undefined}
              onRetry={() => history.refetch()}
            />
          </div>
        ) : counts === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No analyses match"
              description={
                debounced || status !== "all" || dateFrom || dateTo
                  ? "Clear the filters or try a broader date range."
                  : "Start your first bi-temporal comparison to populate the archive."
              }
              action={
                <Button to="/app/new" variant="primary" size="sm">
                  New analysis
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Analysis</th>
                  <th className="px-3 py-2.5 font-medium">Dates</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Change</th>
                  <th className="px-3 py-2.5 text-right font-medium">Area</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.items.map((analysis) => {
                  const thumb = mediaUrl(analysis.thumbnails.after);
                  return (
                    <tr
                      key={analysis.id}
                      className="group border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-line bg-bg-deep">
                            {thumb ? (
                              <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
                            ) : (
                              <span className="flex size-full items-center justify-center text-muted">
                                <ImageOff className="size-4" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <Link
                              to={`/app/results/${analysis.id}`}
                              className="block max-w-[280px] truncate text-[12.5px] font-medium text-ink hover:text-primary"
                            >
                              {analysis.title}
                            </Link>
                            <p className="max-w-[280px] truncate text-[10.5px] text-muted">
                              {analysis.locationName ?? "No location"} ·{" "}
                              <span className="font-mono">{analysis.id.slice(0, 8)}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[11px] text-ink-soft">{formatDate(analysis.dateBefore)}</p>
                        <p className="text-[10.5px] text-muted">→ {formatDate(analysis.dateAfter)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={analysis.status} />
                        {analysis.status === "processing" && (
                          <p className="mt-1 font-mono text-[10px] text-muted">{analysis.progress}%</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <p className="font-mono text-[11.5px] text-ink">
                          {formatPercent(analysis.changeRatio, 2)}
                        </p>
                        {analysis.engine === "spectral_baseline" && (
                          <span className="text-[9.5px] uppercase tracking-wide text-warn">baseline</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[11px] text-muted">
                        {formatArea(analysis.areaKm2)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[11px] text-ink-soft">{relativeTime(analysis.createdAt)}</p>
                        <p className="font-mono text-[10px] text-muted">
                          {analysis.inferenceMs ? `${(analysis.inferenceMs / 1000).toFixed(1)} s` : "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                          <Link
                            to={`/app/results/${analysis.id}`}
                            className="rounded-md border border-line p-1.5 text-muted hover:text-primary"
                            aria-label={`Open ${analysis.title}`}
                            title="Open results"
                          >
                            <Eye className="size-3.5" />
                          </Link>
                          <button
                            onClick={() => download(analysis, "pdf")}
                            disabled={analysis.status !== "completed"}
                            className="rounded-md border border-line p-1.5 text-muted hover:text-ink disabled:opacity-30"
                            aria-label="Download PDF"
                            title="Download PDF"
                          >
                            <FileText className="size-3.5" />
                          </button>
                          <button
                            onClick={() => download(analysis, "zip")}
                            disabled={analysis.status !== "completed"}
                            className="rounded-md border border-line p-1.5 text-muted hover:text-ink disabled:opacity-30"
                            aria-label="Download bundle"
                            title="Download ZIP bundle"
                          >
                            <Download className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setPendingDelete(analysis)}
                            className="rounded-md border border-line p-1.5 text-muted hover:border-danger/40 hover:text-danger"
                            aria-label="Delete analysis"
                            title="Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-[11px] text-muted">
            {total === 0
              ? "No records"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <Badge tone="neutral" mono>page {page}/{pages}</Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              icon={<ChevronLeft className="size-3.5" />}
              aria-label="Previous page"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
              disabled={page >= pages}
              icon={<ChevronRight className="size-3.5" />}
              aria-label="Next page"
            />
          </div>
        </div>
      </Panel>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this analysis?"
        description={
          pendingDelete
            ? `“${pendingDelete.title}” and all of its stored artifacts will be removed permanently.`
            : undefined
        }
        confirmLabel="Delete permanently"
        loading={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
