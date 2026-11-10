import clsx from "clsx";
import { Link } from "react-router-dom";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={clsx("size-9", className)} role="img" aria-label="SenseEarth mark">
      <defs>
        <linearGradient id="se-mark-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C6F36B" />
          <stop offset="100%" stopColor="#9FD14A" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" strokeOpacity="0.18" />
      <circle cx="20" cy="20" r="14" fill="none" stroke="url(#se-mark-a)" strokeWidth="1.5" />
      <path
        d="M6 20h28M20 6c4.6 3.7 7 8.6 7 14s-2.4 10.3-7 14c-4.6-3.7-7-8.6-7-14s2.4-10.3 7-14Z"
        fill="none"
        stroke="url(#se-mark-a)"
        strokeWidth="1.1"
        strokeOpacity="0.75"
      />
      <path d="M20 11v18M11 20h18" stroke="url(#se-mark-a)" strokeWidth="0.9" strokeOpacity="0.35" strokeDasharray="2 3" />
      <circle cx="20" cy="20" r="2.6" fill="#C6F36B" />
      <circle cx="20" cy="20" r="5.4" fill="none" stroke="#F3F0E7" strokeOpacity="0.4" strokeWidth="1" />
    </svg>
  );
}

export function Logo({ to = "/app", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5" aria-label="SenseEarth home">
      <LogoMark className="size-8 shrink-0 text-[#F3F0E7] transition-transform duration-500 group-hover:rotate-12" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[16px] font-semibold tracking-tight text-[#F3F0E7]">
            Sense<span className="text-[#C6F36B]">Earth</span>
          </span>
          <span className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-[#C6F36B]">
            Observe · Analyze · Preserve
          </span>
        </span>
      )}
    </Link>
  );
}
