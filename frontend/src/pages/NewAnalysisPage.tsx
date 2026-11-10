import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Cpu,
  FlaskConical,
  Info,
  MapPin,
  ShieldAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { ImageDropzone, readImageFile, type PickedImage } from "@/components/ImageDropzone";
import {
  Badge,
  Button,
  Field,
  Input,
  LabeledInput,
  PageHeader,
  Panel,
  PanelHeader,
  ProgressBar,
} from "@/components/ui";
import { CosmicOrb } from "@/components/visuals/CosmicOrb";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useModelStatus } from "@/hooks/useSystem";
import { formatArea, formatBytes } from "@/lib/format";
import { formatCoords } from "@/lib/geo";
import { useSelectionStore } from "@/store/selection";
import { toast } from "@/store/ui";

interface FormState {
  title: string;
  locationName: string;
  latitude: string;
  longitude: string;
  dateBefore: string;
  dateAfter: string;
}

const today = new Date().toISOString().slice(0, 10);

export default function NewAnalysisPage() {
  useDocumentTitle("New analysis");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const area = useSelectionStore((state) => state.area);
  const setArea = useSelectionStore((state) => state.setArea);
  const model = useModelStatus();

  const [before, setBefore] = useState<PickedImage | null>(null);
  const [after, setAfter] = useState<PickedImage | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    locationName: area?.label && area.label !== "Point selected on the globe" ? area.label : "",
    latitude: area?.center ? String(area.center[1].toFixed(4)) : "",
    longitude: area?.center ? String(area.center[0].toFixed(4)) : "",
    dateBefore: "",
    dateAfter: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    if (!area) return;
    setForm((current) => ({
      ...current,
      locationName:
        current.locationName ||
        (area.label && area.label !== "Point selected on the globe" ? area.label : ""),
      latitude: current.latitude || (area.center ? String(area.center[1].toFixed(4)) : ""),
      longitude: current.longitude || (area.center ? String(area.center[0].toFixed(4)) : ""),
    }));
  }, [area]);

  const aspectCheck = useMemo(() => {
    if (!before || !after) return { ok: true, message: "" };
    const ratioA = before.width / before.height;
    const ratioB = after.width / after.height;
    const drift = Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB);
    return drift <= 0.02
      ? { ok: true, message: `${before.width}×${before.height} and ${after.width}×${after.height} align` }
      : {
          ok: false,
          message: `Aspect ratios differ by ${(drift * 100).toFixed(1)}%. Crop both images to the same scene and shape.`,
        };
  }, [before, after]);

  const readiness = useMemo(() => {
    const checks = [
      { label: "Earlier image", done: Boolean(before) },
      { label: "Later image", done: Boolean(after) },
      { label: "Matching aspect ratio", done: Boolean(before && after) && aspectCheck.ok },
      { label: "Title", done: form.title.trim().length > 1 },
      { label: "Earlier date ≤ later date", done: !form.dateBefore || !form.dateAfter || form.dateBefore <= form.dateAfter },
    ];
    return { checks, ready: checks.every((check) => check.done) };
  }, [before, after, aspectCheck.ok, form.title, form.dateBefore, form.dateAfter]);

  const loadDemo = async () => {
    setLoadingDemo(true);
    setError(null);
    try {
      const [first, second] = await Promise.all([
        fetch("/samples/before.jpg").then((response) => response.blob()),
        fetch("/samples/after.jpg").then((response) => response.blob()),
      ]);
      const beforeFile = new File([first], "dubai-2024-06-15.jpg", { type: "image/jpeg" });
      const afterFile = new File([second], "dubai-2025-09-20.jpg", { type: "image/jpeg" });
      const [pickedBefore, pickedAfter] = await Promise.all([
        readImageFile(beforeFile),
        readImageFile(afterFile),
      ]);
      if (before) URL.revokeObjectURL(before.url);
      if (after) URL.revokeObjectURL(after.url);
      setBefore(pickedBefore);
      setAfter(pickedAfter);
      setForm((current) => ({
        ...current,
        title: current.title || "Dubai coastline · demo pair",
        locationName: current.locationName || "Dubai, United Arab Emirates",
        latitude: current.latitude || "25.1000",
        longitude: current.longitude || "55.1300",
        dateBefore: "2024-06-15",
        dateAfter: "2025-09-20",
      }));
      if (!area) {
        setArea({
          label: "Dubai coastline",
          bbox: [54.9, 24.85, 55.5, 25.35],
          center: [55.13, 25.1],
          areaKm2: null,
          geometry: null,
          zoom: 11,
        });
      }
      toast("info", "Demo pair loaded", "NASA GIBS MODIS, 512×512, Dubai coastline.");
    } catch {
      setError("Could not load the bundled demo pair from /samples. Check the dev server.");
    } finally {
      setLoadingDemo(false);
    }
  };

  const submit = async () => {
    setError(null);
    const nextFieldErrors: Record<string, string> = {};
    if (!before) nextFieldErrors.before = "Add the earlier acquisition.";
    if (!after) nextFieldErrors.after = "Add the later acquisition.";
    if (form.title.trim().length < 2) nextFieldErrors.title = "Give the run a recognisable title.";
    if (form.dateBefore && form.dateAfter && form.dateBefore > form.dateAfter) {
      nextFieldErrors.dateBefore = "The earlier date must precede the later date.";
    }
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    if (!before || !after) return;
    setFieldErrors({});
    setUploading(true);
    setProgress(0);
    try {
      const created = await api.createAnalysis({
        image1: before.file,
        image2: after.file,
        title: form.title,
        locationName: form.locationName || undefined,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        dateBefore: form.dateBefore || undefined,
        dateAfter: form.dateAfter || undefined,
        area,
        regionId: null,
        onProgress: setProgress,
      });
      await queryClient.invalidateQueries();
      toast("success", "Analysis queued", "The worker is loading the checkpoint now.");
      navigate(`/app/results/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        visual={<CosmicOrb className="size-[74px]" rings particles={false} interactive={false} speed={0.8} />}
        eyebrow="Pipeline"
        title="New change analysis"
        description="Two acquisitions of the same scene. The backend validates both files, queues a job, and runs the published checkpoint."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<FlaskConical className="size-3.5" />}
            onClick={loadDemo}
            loading={loadingDemo}
            disabled={uploading}
          >
            Load demo pair
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Panel className="space-y-4">
            <PanelHeader
              title="Image pair"
              description="Same scene, two dates. They may differ in size, but the aspect ratio must match within 2%."
              icon={<UploadCloud className="size-4" />}
              action={<Badge tone="neutral" mono>step 1 / 2</Badge>}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <ImageDropzone
                  label="Earlier acquisition"
                  caption="Baseline scene"
                  value={before}
                  onChange={(image) => {
                    setBefore(image);
                    setFieldErrors((errors) => ({ ...errors, before: "" }));
                  }}
                  onError={setError}
                  disabled={uploading}
                />
                {fieldErrors.before && <p className="text-[11.5px] text-danger">{fieldErrors.before}</p>}
              </div>
              <div className="space-y-1.5">
                <ImageDropzone
                  label="Later acquisition"
                  caption="Scene to compare against"
                  value={after}
                  onChange={(image) => {
                    setAfter(image);
                    setFieldErrors((errors) => ({ ...errors, after: "" }));
                  }}
                  onError={setError}
                  disabled={uploading}
                />
                {fieldErrors.after && <p className="text-[11.5px] text-danger">{fieldErrors.after}</p>}
              </div>
            </div>

            {(before || after) && (
              <div
                className={clsx(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px]",
                  aspectCheck.ok && before && after
                    ? "border-accent/30 bg-accent/[0.06] text-accent"
                    : before && after
                      ? "border-danger/30 bg-danger/[0.06] text-danger"
                      : "border-line bg-surface-2/50 text-muted",
                )}
              >
                {aspectCheck.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <ShieldAlert className="mt-px size-3.5 shrink-0" />}
                <span>
                  {aspectCheck.message ||
                    "Add the second image to check that both scenes align. The model resizes each image to a 32 px grid."}
                </span>
              </div>
            )}
          </Panel>

          <Panel className="space-y-4">
            <PanelHeader
              title="Context"
              description="Metadata is stored with the result and appears in exported reports."
              icon={<MapPin className="size-4" />}
              action={<Badge tone="neutral" mono>step 2 / 2</Badge>}
            />

            <Field
              label="Analysis title"
              required
              htmlFor="title"
              error={fieldErrors.title}
              hint="Shown in the dashboard, history and report header."
            >
              <Input
                id="title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Rotterdam port expansion, 2019 → 2024"
                maxLength={200}
                disabled={uploading}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledInput
                label="Location name"
                value={form.locationName}
                onChange={(event) => setForm({ ...form, locationName: event.target.value })}
                placeholder="Rotterdam, Netherlands"
                maxLength={200}
                disabled={uploading}
              />
              <div className="grid grid-cols-2 gap-3">
                <LabeledInput
                  label="Latitude"
                  value={form.latitude}
                  onChange={(event) => setForm({ ...form, latitude: event.target.value })}
                  placeholder="51.94"
                  inputMode="decimal"
                  disabled={uploading}
                />
                <LabeledInput
                  label="Longitude"
                  value={form.longitude}
                  onChange={(event) => setForm({ ...form, longitude: event.target.value })}
                  placeholder="4.28"
                  inputMode="decimal"
                  disabled={uploading}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Earlier date" htmlFor="dateBefore" error={fieldErrors.dateBefore}>
                <Input
                  id="dateBefore"
                  type="date"
                  max={today}
                  value={form.dateBefore}
                  onChange={(event) => setForm({ ...form, dateBefore: event.target.value })}
                  disabled={uploading}
                />
              </Field>
              <Field label="Later date" htmlFor="dateAfter" hint="Used in labels and reports — it does not time the imagery.">
                <Input
                  id="dateAfter"
                  type="date"
                  max={today}
                  value={form.dateAfter}
                  onChange={(event) => setForm({ ...form, dateAfter: event.target.value })}
                  disabled={uploading}
                />
              </Field>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-danger">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted">
                {before && after
                  ? `${formatBytes(before.file.size + after.file.size)} upload · CPU inference`
                  : "Waiting for both images"}
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={submit}
                loading={uploading}
                disabled={!readiness.ready}
                iconRight={<ArrowRight className="size-4" />}
              >
                {uploading ? "Uploading…" : "Run analysis"}
              </Button>
            </div>

            {uploading && (
              <ProgressBar
                value={Math.round(progress * 100)}
                label={progress >= 1 ? "Queued — starting the model" : "Uploading pair"}
                sheen
              />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Area of interest" description="Attached to this run and used for area estimates." icon={<Compass className="size-4" />} />
            {area ? (
              <div className="mt-4 space-y-2.5 text-[12px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{area.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {area.center ? formatCoords(area.center[1], area.center[0]) : "No centre"}
                    </p>
                  </div>
                  <button
                    onClick={() => setArea(null)}
                    className="rounded-md p-1 text-muted hover:text-danger"
                    aria-label="Clear area of interest"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="rounded-lg border border-line bg-surface-2/50 p-2.5 font-mono text-[10.5px] leading-relaxed text-muted">
                  <p>bbox {area.bbox ? area.bbox.map((value) => value.toFixed(4)).join(", ") : "none"}</p>
                  <p>area {area.areaKm2 ? formatArea(area.areaKm2) : "pixel-only"}</p>
                </div>
                <Button to="/app/explore" variant="secondary" size="sm" full icon={<MapPin className="size-3.5" />}>
                  Change on the map
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-[12px] leading-relaxed text-muted">
                  No AOI attached. Results will report pixels only — no ground area.
                </p>
                <Button to="/app/explore" variant="outline" size="sm" full icon={<MapPin className="size-3.5" />}>
                  Pick an area on the map
                </Button>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Readiness" description="The API re-validates all of this server-side." />
            <ul className="mt-4 space-y-2">
              {readiness.checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2 text-[12px]">
                  <span
                    className={clsx(
                      "flex size-4 items-center justify-center rounded-full border",
                      check.done ? "border-accent/40 bg-accent/15 text-accent" : "border-line text-muted",
                    )}
                  >
                    {check.done ? <CheckCircle2 className="size-3" /> : <span className="size-1 rounded-full bg-current" />}
                  </span>
                  <span className={check.done ? "text-ink-soft" : "text-muted"}>{check.label}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="Model" icon={<Cpu className="size-4" />} description={model.data?.name ?? "Loading status…"} />
            <dl className="mt-4 space-y-2 text-[11.5px]">
              {[
                ["Device", model.data?.device ?? "—"],
                ["Input", `${model.data?.inputRequirements.defaultInputSize ?? 512} px square`],
                ["Formats", (model.data?.inputRequirements.allowedFormats ?? []).join(", ") || "—"],
                ["Max upload", `${model.data?.inputRequirements.maxUploadMb ?? 20} MB per image`],
              ].map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5 last:border-0">
                  <dt className="text-muted">{key}</dt>
                  <dd className="text-right font-mono text-[10.5px] text-ink-soft">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2/50 p-2.5 text-[10.5px] leading-relaxed text-muted">
              <Info className="mt-px size-3.5 shrink-0 text-primary/80" />
              Images are normalised with ImageNet statistics and resized to a multiple of 32 before inference.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
