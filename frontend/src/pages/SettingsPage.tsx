import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  KeyRound,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  ServerCog,
  Sun,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import {
  Badge,
  Button,
  Field,
  Input,
  LabeledInput,
  PageHeader,
  Panel,
  PanelHeader,
  Swatch,
} from "@/components/ui";
import { CosmicOrb } from "@/components/visuals/CosmicOrb";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useHealth, useModelStatus, useStorageUsage } from "@/hooks/useSystem";
import { CHANGE_CLASSES } from "@/lib/classes";
import { formatBytes, formatNumber } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { toast, useUiStore } from "@/store/ui";

export default function SettingsPage() {
  useDocumentTitle("Settings");
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const health = useHealth();
  const model = useModelStatus();
  const storage = useStorageUsage();

  const [name, setName] = useState(user?.name ?? "");
  const [organization, setOrganization] = useState(user?.organization ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setOrganization(user?.organization ?? "");
  }, [user?.name, user?.organization]);

  const saveProfile = useMutation({
    mutationFn: () => api.updateMe({ name: name.trim(), organization: organization.trim() }),
    onSuccess: (updated) => {
      updateUser(updated);
      toast("success", "Profile updated");
    },
    onError: (error) => toast("error", "Could not save", error instanceof ApiError ? error.message : undefined),
  });

  const changePassword = useMutation({
    mutationFn: () => api.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError(null);
      toast("success", "Password changed", "Use the new password the next time you sign in.");
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : "Could not change the password.";
      setPasswordError(message);
      toast("error", "Password unchanged", message);
    },
  });

  const recover = useMutation({
    mutationFn: () => api.recoverStaleJobs(),
    onSuccess: (payload) => {
      toast("success", "Job table reconciled", `${payload.recovered} interrupted job(s) marked failed.`);
      void queryClient.invalidateQueries();
    },
    onError: (error) => toast("error", "Recovery failed", error instanceof ApiError ? error.message : undefined),
  });

  const usage = storage.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Account, appearance, the inference engine and what this build stores on disk."
        visual={<CosmicOrb className="size-[52px] opacity-70" rings={false} particles={false} interactive={false} speed={0.4} />}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="space-y-4">
          <PanelHeader title="Profile" description="Shown on reports and in the account menu." icon={<UserRound className="size-4" />} />
          <LabeledInput label="Display name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          <LabeledInput
            label="Organization"
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
            placeholder="Optional"
            maxLength={160}
          />
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="min-w-0">
              <p className="truncate font-mono text-[11px] text-ink-soft">{user?.email}</p>
              <p className="text-[10.5px] text-muted">Email is fixed for this build.</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={saveProfile.isPending}
              disabled={!name.trim() || (name === user?.name && organization === (user?.organization ?? ""))}
              onClick={() => saveProfile.mutate()}
            >
              Save profile
            </Button>
          </div>
          {user?.isDemo && (
            <p className="rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[11px] leading-relaxed text-warn">
              You are using the shared demo account. Its analyses are visible to anyone who signs in
              with the same demo credentials.
            </p>
          )}
        </Panel>

        <Panel className="space-y-4">
          <PanelHeader title="Password" description="PBKDF2-SHA256 with a per-user salt." icon={<KeyRound className="size-4" />} />
          <Field label="Current password" htmlFor="current-password">
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field
            label="New password"
            htmlFor="new-password"
            hint="At least 8 characters."
            error={passwordError}
          >
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
          </Field>
          <div className="flex justify-end border-t border-line pt-4">
            <Button
              variant="secondary"
              size="sm"
              loading={changePassword.isPending}
              disabled={!currentPassword || newPassword.length < 8}
              onClick={() => changePassword.mutate()}
            >
              Change password
            </Button>
          </div>
        </Panel>

        <Panel className="space-y-4">
          <PanelHeader title="Appearance" description="Theme is stored in this browser only." icon={<Palette className="size-4" />} />
          <div className="grid grid-cols-2 gap-2">
            {(["dark", "light"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                className={clsx(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  theme === option
                    ? "border-primary/45 bg-primary/[0.07]"
                    : "border-line hover:border-line-strong hover:bg-surface-2/60",
                )}
              >
                <span
                  className={clsx(
                    "flex size-9 items-center justify-center rounded-lg border",
                    option === "dark" ? "border-line bg-[#07111F] text-primary" : "border-line bg-[#EFF4F9] text-[#0E8EA8]",
                  )}
                >
                  {option === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </span>
                <span>
                  <span className="block text-[12.5px] font-medium capitalize text-ink">{option}</span>
                  <span className="block text-[10.5px] text-muted">
                    {option === "dark" ? "Low-light workspace" : "Daylight workspace"}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-line bg-surface-2/50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Class palette (fixed)</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
              {CHANGE_CLASSES.map((entry) => (
                <span key={entry.id} className="flex items-center gap-1.5 text-[10.5px] text-muted">
                  <Swatch hex={entry.hex} />
                  {entry.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              These colours are dictated by the checkpoint's label encoding and are not themable.
            </p>
          </div>
        </Panel>

        <Panel className="space-y-3">
          <PanelHeader
            title="Inference engine"
            description="Live status from the FastAPI process."
            icon={<Cpu className="size-4" />}
            action={<Badge tone={model.data?.available ? "success" : "warning"} dot>{model.data?.available ? "ready" : "unavailable"}</Badge>}
          />
          <dl className="space-y-2 text-[11.5px]">
            {[
              ["Model", model.data?.name ?? "—"],
              ["Engine id", model.data ? `${model.data.model ?? "pspnet"} + ${model.data.backbone ?? "hrnet_w18"}` : "—"],
              ["Device", model.data?.device ?? "—"],
              ["Checkpoint", model.data?.weightsPath ?? "—"],
              ["Weights size", formatBytes(model.data?.weightsBytes ?? 0)],
              ["Fingerprint", model.data?.weightsFingerprint ?? "—"],
              ["Parameters", model.data?.parameters ? `${(model.data.parameters / 1e6).toFixed(2)} M` : "—"],
              ["Classes", model.data?.numSemanticClasses ? `${model.data.numSemanticClasses} incl. unchanged` : "—"],
              ["Baseline fallback", model.data?.baselineFallbackEnabled ? "enabled" : "disabled"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5 last:border-0">
                <dt className="shrink-0 text-muted">{label}</dt>
                <dd className="truncate text-right font-mono text-[10.5px] text-ink-soft" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-2 pt-1 text-[10.5px] text-muted">
            <CheckCircle2 className={clsx("size-3.5", health.data?.database === "ok" ? "text-accent" : "text-warn")} />
            API {health.data?.version ?? "—"} · DB {health.data?.database ?? "—"} · Python {health.data?.python ?? "—"}
          </div>
        </Panel>

        <Panel className="space-y-3">
          <PanelHeader title="Storage" description="Bytes on this machine, not a hosted bucket." icon={<HardDrive className="size-4" />} />
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Uploads", usage?.uploadsBytes ?? 0],
              ["Predictions", usage?.predictionsBytes ?? 0],
              ["Reports", usage?.reportsBytes ?? 0],
            ].map(([label, bytes]) => (
              <div key={label as string} className="rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
                <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">{label as string}</p>
                <p className="mt-1 font-mono text-[12px] text-ink">{formatBytes(bytes as number)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted">Total used</span>
            <span className="font-mono text-ink">{formatBytes(usage?.totalBytes ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted">Your analyses</span>
            <span className="font-mono text-ink">{formatNumber(usage?.analyses ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted">Model weights</span>
            <span className="font-mono text-ink">{formatBytes(usage?.modelWeightsBytes ?? 0)}</span>
          </div>
        </Panel>

        <Panel className="space-y-4">
          <PanelHeader title="Maintenance" description="Safe operations against the local database." icon={<ServerCog className="size-4" />} />
          <div className="space-y-2 text-[11.5px] leading-relaxed text-muted">
            <p>
              Jobs run in an in-process worker pool. If the API stops mid-run, the record stays in
              “processing”. Reconcile marks those interrupted jobs as failed so they can be retried.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={recover.isPending}
              onClick={() => recover.mutate()}
              icon={<RefreshCw className="size-3.5" />}
            >
              Reconcile interrupted jobs
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Database className="size-3.5" />}
              onClick={() => {
                void queryClient.invalidateQueries();
                toast("info", "Refreshed", "All server queries were re-fetched.");
              }}
            >
              Refresh data
            </Button>
          </div>
          <div className="rounded-lg border border-line bg-bg-deep/50 p-3 font-mono text-[10px] leading-relaxed text-muted">
            <p>API · http://localhost:8000/api</p>
            <p>WEB · http://localhost:5173</p>
            <p>DB · storage/senseearth.db</p>
            <p>WEIGHTS · models/weights/pspnet_hrnet_w18.pth</p>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <div>
              <p className="text-[12px] text-ink">End this session</p>
              <p className="text-[10.5px] text-muted">Your stored analyses stay on disk.</p>
            </div>
            <Button
              variant="danger"
              size="sm"
              icon={<LogOut className="size-3.5" />}
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              Sign out
            </Button>
          </div>
        </Panel>
      </div>

      <Panel className="space-y-2">
        <PanelHeader title="Limitations of this build" description="Stated plainly so results are not over-read." />
        <ul className="grid gap-2 text-[11.5px] leading-relaxed text-muted md:grid-cols-2">
          {[
            "Inference is CPU-only and runs one job at a time per worker; large batches will queue.",
            "The checkpoint was trained on urban scenes and can mislabel unfamiliar terrain or seasons.",
            "Area figures are planar approximations of the AOI you supply, not surveyed extents.",
            "Basemaps are NASA GIBS MODIS (250 m) and OpenStreetMap; they are never used as analysis input.",
            "No automatic imagery ingestion, alerting, NDVI or emissions modelling is implemented.",
            "Sign-in is a local account system; there is no email verification, SSO or password reset flow.",
          ].map((limitation) => (
            <li key={limitation} className="flex gap-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted/70" />
              {limitation}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
