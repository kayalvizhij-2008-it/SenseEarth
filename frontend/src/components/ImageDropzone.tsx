import clsx from "clsx";
import { ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { ANALYSIS_LIMITS } from "@/lib/classes";
import { formatBytes, formatNumber } from "@/lib/format";

export interface PickedImage {
  file: File;
  url: string;
  width: number;
  height: number;
}

export function isAcceptedImage(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    ANALYSIS_LIMITS.acceptedTypes.includes(file.type) ||
    ANALYSIS_LIMITS.acceptedExtensions.some((extension) => name.endsWith(extension))
  );
}

export function readImageFile(file: File): Promise<PickedImage> {
  return new Promise((resolve, reject) => {
    if (!isAcceptedImage(file)) {
      reject(new Error("Use a JPG, PNG or WebP image."));
      return;
    }
    if (file.size > ANALYSIS_LIMITS.maxUploadMb * 1024 * 1024) {
      reject(new Error(`Images must be under ${ANALYSIS_LIMITS.maxUploadMb} MB.`));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () =>
      resolve({ file, url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be decoded as an image."));
    };
    image.src = url;
  });
}

export function ImageDropzone({
  label,
  caption,
  value,
  onChange,
  onError,
  disabled,
  loading,
}: {
  label: string;
  caption: string;
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const picked = await readImageFile(file);
      if (value) URL.revokeObjectURL(value.url);
      onChange(picked);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Could not read that image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => {
    if (value) URL.revokeObjectURL(value.url);
    onChange(null);
  };

  return (
    <div
      className={clsx(
        "group relative flex min-h-[218px] flex-col overflow-hidden rounded-2xl border transition-colors",
        dragging ? "border-primary/70 bg-primary/[0.06]" : "border-line bg-surface",
        disabled && "opacity-60",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) void handleFiles(event.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">{label}</p>
          <p className="text-[10.5px] text-muted">{caption}</p>
        </div>
        {value && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label={`Replace ${label}`}
              disabled={disabled}
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              aria-label={`Remove ${label}`}
              disabled={disabled}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="relative flex flex-1 flex-col items-center justify-center gap-2 px-4 py-5 text-center"
      >
        {value ? (
          <>
            <img
              src={value.url}
              alt={`${label} preview`}
              className="absolute inset-0 size-full object-cover opacity-90"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <span className="relative mt-auto w-full text-left">
              <span className="block truncate text-[11.5px] font-medium text-white">{value.file.name}</span>
              <span className="mt-0.5 block font-mono text-[10px] text-white/75">
                {formatNumber(value.width)} × {formatNumber(value.height)} px · {formatBytes(value.file.size)}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted transition-colors group-hover:text-primary">
              {busy || loading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            </span>
            <span className="text-[12px] text-ink-soft">
              Drop an image or <span className="text-primary">browse</span>
            </span>
            <span className="text-[10px] text-muted">JPG · PNG · WebP · max {ANALYSIS_LIMITS.maxUploadMb} MB</span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ANALYSIS_LIMITS.acceptedTypes.join(",")}
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
        disabled={disabled}
      />
    </div>
  );
}
