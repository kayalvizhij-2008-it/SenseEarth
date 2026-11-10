import clsx from "clsx";
import { MoveHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";

export function BeforeAfter({
  beforeSrc,
  afterSrc,
  beforeLabel = "Earlier",
  afterLabel = "Later",
  className,
  initial = 50,
  rounded = "rounded-2xl",
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  initial?: number;
  rounded?: string;
}) {
  const [position, setPosition] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateFromClientX = useCallback((clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const next = ((clientX - bounds.left) / bounds.width) * 100;
    setPosition(Math.max(0, Math.min(100, next)));
  }, []);

  return (
    <div
      ref={containerRef}
      className={clsx(
        "group relative select-none overflow-hidden border border-line bg-bg-deep",
        rounded,
        className,
      )}
      onPointerDown={(event) => {
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (dragging) updateFromClientX(event.clientX);
      }}
      onPointerUp={(event) => {
        setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <img
        src={afterSrc}
        alt={afterLabel}
        className="absolute inset-0 size-full object-cover"
        draggable={false}
        loading="lazy"
      />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img
          src={beforeSrc}
          alt={beforeLabel}
          className="size-full object-cover"
          draggable={false}
          loading="lazy"
        />
      </div>

      <div
        className="absolute inset-y-0 z-10 w-px bg-white/85 shadow-[0_0_18px_rgba(34,211,238,0.55)]"
        style={{ left: `${position}%` }}
      >
        <button
          type="button"
          role="slider"
          aria-label="Reveal earlier or later image"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setPosition((value) => Math.max(0, value - 4));
            if (event.key === "ArrowRight") setPosition((value) => Math.min(100, value + 4));
          }}
          className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-white/60 bg-bg/80 text-white backdrop-blur-md transition-transform hover:scale-105"
        >
          <MoveHorizontal className="size-4" />
        </button>
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/85 backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/85 backdrop-blur-sm">
        {afterLabel}
      </span>
    </div>
  );
}
