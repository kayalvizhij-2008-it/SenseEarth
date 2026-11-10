import { ArrowRight, ArrowUpRight, CheckCircle2, Clock3, Layers, MapPin, Play, Radar, ScanLine, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button, ClassLegend, EmptyState, Panel, PanelHeader, StatusBadge } from "@/components/ui";
import { MiniMap } from "@/components/maps/MiniMap";
import { EarthScene } from "@/components/scene/EarthScene";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRecentAnalyses, useSummary } from "@/hooks/useSystem";
import { CHANGE_CLASSES } from "@/lib/classes";
import { formatPercent, relativeTime } from "@/lib/format";

gsap.registerPlugin(ScrollTrigger);

const ALL_CLASSES = CHANGE_CLASSES;

export default function HomePage() {
  useDocumentTitle("Home");
  const summary = useSummary();
  const recent = useRecentAnalyses(5);

  const counts = summary.data;
  const latest = recent.data?.items?.[0] ?? null;

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      gsap.from("[data-hero-line]", {
        y: 26,
        opacity: 0,
        stagger: 0.09,
        duration: 0.75,
        ease: "power3.out",
      });
      const reveals = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      reveals.forEach((el) => {
        gsap.from(el, {
          y: 34,
          opacity: 0,
          duration: 0.75,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 86%",
            toggleActions: "play none none reverse",
          },
        });
      });
      const visual = root.querySelector("[data-hero-visual]");
      if (visual) {
        gsap.to(visual, {
          yPercent: -10,
          ease: "none",
          scrollTrigger: {
            trigger: root.querySelector("[data-hero]") ?? root,
            start: "top top",
            end: "bottom top",
            scrub: 1.1,
          },
        });
      }
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="space-y-5">
      {/* --------------------------------------------------------------- hero */}
      <section data-hero className="se-noise relative overflow-hidden rounded-[26px] border border-line bg-[radial-gradient(120%_120%_at_78%_10%,#23301a_0%,#151711_46%,#0e100b_100%)] px-6 py-8 sm:px-9 sm:py-10">
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p data-hero-line className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#C6F36B]">
              <span className="h-px w-6 bg-[#C6F36B]/70" />
              Satellite change detection platform
            </p>
            <h1 data-hero-line className="mt-5 text-[38px] font-semibold leading-[1.02] tracking-[-0.03em] text-[#F3F0E7] sm:text-[52px] lg:text-[58px]">
              See What <span className="text-[#C6F36B]">Changed.</span>
              <br />
              Understand <span className="text-[#C6F36B]">Why.</span>
            </h1>
            <p data-hero-line className="mt-5 max-w-md text-[13.5px] leading-relaxed text-[#D8D8CB]">
              Compare satellite captures. Detect land-cover changes. Explore the regions that matter.
            </p>
            <div data-hero-line className="mt-7 flex flex-wrap items-center gap-3">
              <Button to="/app/explore" variant="primary" icon={<MapPin className="size-4" />}>
                Explore Earth
              </Button>
              <Button to="/app/new" variant="secondary" icon={<Play className="size-3.5" />}>
                Compare Captures
              </Button>
            </div>
            <dl data-hero-line className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-[#F3F0E7]/10 pt-5">
              {[
                ["Records", summary.isLoading ? "—" : String(counts?.totalAnalyses ?? 0)],
                ["Regions", summary.isLoading ? "—" : String(counts?.regions ?? 0)],
                ["Last run", latest ? relativeTime(latest.createdAt) : "No comparisons yet"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#C6F36B]">{label}</dt>
                  <dd className="mt-1 text-[13px] text-[#F3F0E7]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div data-hero-visual className="relative">
            <EarthScene className="h-[340px] w-full sm:h-[400px] lg:h-[460px]" interactive={false} scrollDriven />
            <span className="pointer-events-none absolute bottom-1 left-0 font-mono text-[9px] uppercase tracking-[0.16em] text-[#C5C5B8]">
              Drag to rotate · markers are the six preset study areas
            </span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- cards */}
      <div className="grid gap-5 xl:grid-cols-12">
        <Panel data-reveal className="xl:col-span-5">
          <PanelHeader
            title="Explore the Map"
            description="Navigate, select and carry any region into a comparison."
            icon={<Layers className="size-4" />}
            action={
              <Link to="/app/explore" className="flex items-center gap-1 text-[11.5px] text-primary hover:underline">
                Open map <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          <Link to="/app/explore" className="mt-4 block" aria-label="Open Explore Earth">
            <MiniMap
              className="h-[190px] w-full"
              center={latest?.latitude && latest?.longitude ? [latest.latitude, latest.longitude] : [21.2, 78.9]}
              zoom={latest?.latitude ? 8 : 4}
              ring={
                latest?.bbox
                  ? [
                      [latest.bbox[0], latest.bbox[1]],
                      [latest.bbox[2], latest.bbox[1]],
                      [latest.bbox[2], latest.bbox[3]],
                      [latest.bbox[0], latest.bbox[3]],
                    ]
                  : null
              }
            />
          </Link>
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span className="truncate">{latest ? `Latest footprint · ${latest.locationName ?? latest.title}` : "Satellite context · NASA GIBS MODIS Terra"}</span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em]">basemap only</span>
          </div>
        </Panel>

        <Panel data-reveal className="xl:col-span-4">
          <PanelHeader
            title="Your Analysis Overview"
            description="Counts come from stored comparisons, not estimates."
            icon={<ScanLine className="size-4" />}
          />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {[
              { label: "Comparisons", value: counts?.totalAnalyses ?? 0, icon: <ScanLine className="size-3.5" /> },
              { label: "Completed", value: counts?.completed ?? 0, icon: <CheckCircle2 className="size-3.5" /> },
              { label: "Processing", value: counts?.processing ?? 0, icon: <Clock3 className="size-3.5" /> },
              { label: "Failed", value: counts?.failed ?? 0, icon: <TriangleAlert className="size-3.5" /> },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-line bg-surface-2/40 p-3">
                <div className="flex items-center justify-between text-muted">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em]">{item.label}</span>
                  <span className="text-primary">{item.icon}</span>
                </div>
                <p className="mt-2 font-mono text-[19px] leading-none text-ink">{summary.isLoading ? "—" : item.value}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel data-reveal className="xl:col-span-3">
          <PanelHeader
            title="Model Capabilities"
            description="Six semantic classes from the trained PSPNet / HRNet checkpoint."
            icon={<Radar className="size-4" />}
          />
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ALL_CLASSES.map((item) => (
              <span
                key={item.key}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2/50 px-2.5 py-1 text-[11px] text-ink-soft"
                title={item.description}
              >
                <span className="size-2 rounded-[2px]" style={{ background: item.hex }} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
            <p>Colours above are the model's own label encoding, not brand colours.</p>
            <p>Change detection is binary; the semantic head names the class each changed pixel became.</p>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
            <ClassLegend size="sm" />
            <Link to="/app/insights" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
              Read outputs <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel data-reveal className="xl:col-span-12">
          <PanelHeader
            title="Recent Activity"
            description="Each row opens the result it produced."
            icon={<Clock3 className="size-4" />}
            action={
              <Link to="/app/reports" className="flex items-center gap-1 text-[11.5px] text-primary hover:underline">
                All records <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="mt-4">
            {recent.isLoading ? (
              <p className="py-6 text-center text-[12px] text-muted">Loading stored comparisons…</p>
            ) : (recent.data?.items?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<ScanLine className="size-5" />}
                title="No analysis records yet"
                description="Upload two captures of the same area to create your first comparison. The mask, class totals and report are generated by the model itself."
                action={
                  <Button to="/app/new" variant="primary" size="sm">
                    Upload two captures
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {recent.data?.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.status === "completed" ? `/app/results/${item.id}` : `/app/reports`}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 transition-colors hover:bg-surface-2/40 sm:grid-cols-[1.4fr_1fr_auto_auto]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] text-ink">{item.title}</span>
                        <span className="block truncate text-[10.5px] text-muted">
                          {item.locationName ?? "No location given"} · {relativeTime(item.createdAt)}
                        </span>
                      </span>
                      <span className="hidden font-mono text-[11px] text-ink-soft sm:block">
                        {item.changeRatio !== null ? formatPercent(item.changeRatio) : "—"} changed
                      </span>
                      <span className="hidden sm:block">
                        <StatusBadge status={item.status} />
                      </span>
                      <ArrowUpRight className="size-3.5 justify-self-end text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
