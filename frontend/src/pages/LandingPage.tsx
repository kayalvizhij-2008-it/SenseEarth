import { motion } from "framer-motion";
import gsap from "gsap";
import {
  ArrowRight,
  ArrowUpRight,
  Cpu,
  Database,
  FileDown,
  Layers,
  MapPin,
  ScanLine,
  ShieldCheck,
  Sparkles,
  SquareDashed,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Swatch } from "@/components/ui";
import { BeforeAfter } from "@/components/BeforeAfter";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingNav";
import { EarthScene } from "@/components/scene/EarthScene";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { CHANGE_CLASSES } from "@/lib/classes";
import { bboxAreaKm2, bboxFromViewport, bboxToPolygon } from "@/lib/geo";
import { useSelectionStore } from "@/store/selection";

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
};

function HeroHud({
  coords,
  onReset,
}: {
  coords: { lat: number; lon: number } | null;
  onReset: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-4 top-4 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-primary/80">
        <span className="size-1.5 rounded-full bg-accent se-live-dot" />
        orbit view · ecef
      </div>
      <div className="absolute right-4 top-4 font-mono text-[9.5px] uppercase tracking-[0.2em] text-white/45">
        6 classes / 512 px
      </div>
      <span className="absolute bottom-4 left-4 size-6 border-b border-l border-white/25" />
      <span className="absolute bottom-4 right-4 size-6 border-b border-r border-white/25" />
      <span className="absolute left-4 top-11 size-6 border-l border-t border-white/25" />
      <span className="absolute right-4 top-11 size-6 border-r border-t border-white/25" />

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-center">
        {coords ? (
          <button
            type="button"
            onClick={onReset}
            className="pointer-events-auto rounded-full border border-primary/40 bg-bg/70 px-3 py-1.5 font-mono text-[10px] tracking-wide text-primary backdrop-blur-md"
          >
            {Math.abs(coords.lat).toFixed(2)}°{coords.lat >= 0 ? "N" : "S"} ·{" "}
            {Math.abs(coords.lon).toFixed(2)}°{coords.lon >= 0 ? "E" : "W"} · reset
          </button>
        ) : (
          <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/40">
            drag to rotate · click to seed an area
          </p>
        )}
      </div>
    </div>
  );
}

const TRUST = [
  { label: "Trained PSPNet-HRNet weights", Icon: Cpu },
  { label: "Real inference, no mocks", Icon: ShieldCheck },
  { label: "Areas from your AOI", Icon: SquareDashed },
];

export default function LandingPage() {
  useDocumentTitle("Satellite change intelligence");
  const heroRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const setArea = useSelectionStore((state) => state.setArea);
  const navigate = useNavigate();

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.from("[data-hero-line]", {
        yPercent: 112,
        duration: 1.15,
        stagger: 0.075,
        ease: "power4.out",
        delay: 0.15,
      });
      gsap.from("[data-hero-fade]", {
        y: 16,
        opacity: 0,
        duration: 0.9,
        stagger: 0.07,
        ease: "power2.out",
        delay: 0.5,
      });
    }, heroRef);
    return () => context.revert();
  }, []);

  const handlePick = (lat: number, lon: number) => {
    setCoords({ lat, lon });
    const bbox = bboxFromViewport([lon, lat], 11);
    setArea({
      label: "Point selected on the globe",
      bbox,
      center: [lon, lat],
      areaKm2: bboxAreaKm2(bbox),
      geometry: bboxToPolygon(bbox) as unknown as Record<string, unknown>,
      zoom: 11,
    });
    navigate("/app/new");
  };

  return (
    <div className="min-h-screen bg-bg">
      <MarketingNav />

      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="se-grid-bg pointer-events-none absolute inset-0 opacity-70" />
        <div className="se-glow pointer-events-none absolute inset-0 opacity-80" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

        <div
          ref={heroRef}
          className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-14 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-6 lg:pb-20 lg:pt-16"
        >
          <div className="relative z-10 max-w-xl">
            <div data-hero-fade className="flex items-center gap-3">
              <Badge tone="primary" dot mono>
                Bi-temporal change detection
              </Badge>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                v2.0 · research build
              </span>
            </div>

            <h1 className="mt-6 text-[38px] font-semibold leading-[1.04] tracking-[-0.035em] text-ink sm:text-[52px] lg:text-[58px]">
              <span className="block overflow-hidden pb-1">
                <span data-hero-line className="block">
                  See what changed.
                </span>
              </span>
              <span className="block overflow-hidden pb-1">
                <span data-hero-line className="block">
                  Know <span className="text-primary">what it became.</span>
                </span>
              </span>
            </h1>

            <p data-hero-fade className="mt-6 max-w-lg text-[15px] leading-relaxed text-ink-soft/90">
              SenseEarth compares two satellite acquisitions of the same place and returns a
              semantic change mask — new water, vegetation, bare ground, buildings — with pixel
              counts, class transitions and an exportable report.
            </p>

            <div data-hero-fade className="mt-8 flex flex-wrap items-center gap-3">
              <Button to="/app/new" variant="primary" size="lg" icon={<ScanLine className="size-4" />}>
                Start an analysis
              </Button>
              <Button to="/login" variant="outline" size="lg" iconRight={<ArrowUpRight className="size-4" />}>
                Enter workspace
              </Button>
            </div>

            <div data-hero-fade className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-muted">
              {TRUST.map(({ label, Icon }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <Icon className="size-3.5 text-primary/80" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative z-0 lg:-mr-6">
            <div className="relative mx-auto aspect-square w-full max-w-[560px]">
              <div className="absolute inset-6 rounded-full bg-primary/10 blur-3xl" aria-hidden />
              <EarthScene className="absolute inset-0" onPick={handlePick} />
              <HeroHud coords={coords} onReset={() => setCoords(null)} />
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-7xl px-5 pb-10 sm:px-8">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
            {[
              ["Change classes", "6", "water · ground · vegetation · trees · buildings · sports"],
              ["Checkpoint", "39.4 MB", "PSPNet backbone with HRNet-W18"],
              ["Input", "512 px", "square grid, ImageNet normalisation"],
              ["CPU inference", "~4 s", "measured on a 512×512 pair"],
            ].map(([label, value, detail]) => (
              <div key={label} className="bg-surface/80 px-5 py-4 backdrop-blur">
                <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted">{label}</dt>
                <dd className="mt-1.5 font-mono text-[19px] text-ink">{value}</dd>
                <dd className="mt-1 text-[10.5px] leading-snug text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------------------- output */}
      <section id="output" className="border-b border-line py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <motion.div {...fadeUp} className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-bg-deep p-2">
              <BeforeAfter
                beforeSrc="/samples/before.jpg"
                afterSrc="/samples/after.jpg"
                beforeLabel="2024-06-15"
                afterLabel="2025-09-20"
                className="aspect-[4/3]"
              />
            </div>
            <p className="flex flex-wrap items-center gap-2 text-[10.5px] text-muted">
              <span className="font-mono uppercase tracking-[0.14em] text-primary/80">shipped demo pair</span>
              NASA GIBS / MODIS Terra true colour · Dubai coastline · 250 m source pixels
            </p>
          </motion.div>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }} className="space-y-6">
            <div className="space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Output</p>
              <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-ink sm:text-[36px]">
                Two dates in. One mask out.
              </h2>
              <p className="max-w-md text-[13.5px] leading-relaxed text-muted">
                The network classifies the later scene and predicts which pixels changed. Every
                changed pixel carries a semantic label and the class it came from.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <figure className="overflow-hidden rounded-xl border border-line bg-surface">
                <img
                  src="/samples/example-mask.png"
                  alt="Binary change mask from the model"
                  className="aspect-square w-full bg-white object-cover"
                />
                <figcaption className="border-t border-line px-3 py-2 text-[10.5px] text-muted">
                  Binary mask · change in blue
                </figcaption>
              </figure>
              <figure className="overflow-hidden rounded-xl border border-line bg-surface">
                <img
                  src="/samples/example-overlay.png"
                  alt="Change overlay on the later image"
                  className="aspect-square w-full bg-white object-cover"
                />
                <figcaption className="border-t border-line px-3 py-2 text-[10.5px] text-muted">
                  Overlay · mask on the later date
                </figcaption>
              </figure>
            </div>

            <ul className="space-y-2.5">
              {[
                "0.26% of pixels flagged in this demo run — mostly water encroaching on bare ground",
                "Each result stores the mask, semantic map, overlay, statistics and a PDF/CSV/ZIP report",
                "Insights are generated deterministically from stored numbers, never from an LLM guess",
              ].map((item) => (
                <li key={item} className="flex gap-2.5 text-[12.5px] leading-relaxed text-ink-soft/90">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------ pipeline */}
      <section id="pipeline" className="border-b border-line bg-surface/25 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <motion.div {...fadeUp} className="max-w-2xl space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Workflow</p>
            <h2 className="text-[30px] font-semibold tracking-tight text-ink sm:text-[36px]">
              From a coordinate to a reviewable report
            </h2>
            <p className="text-[13.5px] leading-relaxed text-muted">
              Inference runs in a backend worker, not in the browser. You can close the tab while a
              job runs and pick the results up from the history.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: MapPin,
                title: "Choose the ground",
                body: "Pick an area on the map, or type coordinates. The AOI travels with the analysis and sets the area estimate.",
              },
              {
                step: "02",
                icon: Layers,
                title: "Upload the pair",
                body: "Two acquisitions of the same scene at matching dimensions. The API validates format, size and aspect ratio before it queues anything.",
              },
              {
                step: "03",
                icon: FileDown,
                title: "Read the change",
                body: "Review class transitions, pixel counts and an AOI-based area, then export the evidence as PDF, CSV or a ZIP bundle.",
              },
            ].map(({ step, icon: Icon, title, body }, index) => (
              <motion.div
                key={step}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: index * 0.07 }}
                className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-muted">{step}</span>
                  <Icon className="size-4 text-primary/70" />
                </div>
                <h3 className="mt-6 text-[16px] font-medium text-ink">{title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{body}</p>
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- classes */}
      <section id="classes" className="border-b border-line py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <motion.div {...fadeUp} className="space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Label space</p>
              <h2 className="text-[30px] font-semibold tracking-tight text-ink sm:text-[36px]">
                The palette is the model's answer
              </h2>
              <p className="max-w-sm text-[13.5px] leading-relaxed text-muted">
                Class ids come straight from the checkpoint's label encoding. The same six colours
                appear in the mask, the legend, the map overlay and every export.
              </p>
              <div className="flex items-center gap-2 pt-2 text-[11px] text-muted">
                <Database className="size-3.5 text-primary/70" />
                Source: <span className="font-mono">utils/palette.py</span>
              </div>
            </motion.div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CHANGE_CLASSES.filter((entry) => entry.id !== 0).map((entry, index) => (
                <motion.div
                  key={entry.id}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: index * 0.05 }}
                  className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-bg-deep">
                    <Swatch hex={entry.hex} className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2 text-[13px] font-medium text-ink">
                      {entry.label}
                      <span className="font-mono text-[9.5px] uppercase tracking-wide text-muted">
                        #{entry.hex}
                      </span>
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{entry.description}</p>
                  </div>
                </motion.div>
              ))}
              <motion.div
                {...fadeUp}
                className="flex items-center gap-3 rounded-xl border border-dashed border-line/80 px-4 py-3 text-[11.5px] text-muted sm:col-span-2"
              >
                <Swatch hex="#FFFFFF" className="size-3.5" />
                Unchanged pixels are class 0 and stay white in the binary mask.
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- model */}
      <section id="model" className="border-b border-line bg-surface/25 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-2">
          <motion.div {...fadeUp} className="space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Model card</p>
            <h2 className="text-[30px] font-semibold tracking-tight text-ink sm:text-[36px]">
              The research network, wired to a product
            </h2>
            <p className="max-w-md text-[13.5px] leading-relaxed text-muted">
              The interface does not simulate inference. It loads the published checkpoint into the
              original model definition and runs it on CPU through a FastAPI worker pool.
            </p>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
              {[
                ["Architecture", "PSPNet + HRNet-W18"],
                ["Parameters", "9.7 M"],
                ["Checkpoint", "39.35 MB · verified load"],
                ["Decoding", "argmax + 1 over 6 channels"],
                ["Change rule", "unchanged probability ≤ 0.5"],
                ["Runtime", "PyTorch 2.6 CPU"],
              ].map(([key, value]) => (
                <div key={key} className="bg-surface px-4 py-3">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">{key}</dt>
                  <dd className="mt-1 font-mono text-[12px] text-ink-soft">{value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.08 }}
            className="rounded-2xl border border-line bg-surface p-6"
          >
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
              <Sparkles className="size-4 text-warn" />
              Honest limitations
            </div>
            <ul className="mt-4 space-y-3 text-[12.5px] leading-relaxed text-muted">
              {[
                "The checkpoint was trained on urban change scenes; unfamiliar sensors and seasons can shift results. Review the mask before acting on it.",
                "Areas are planar approximations of the AOI you supply. Without a geographic boundary, results stay in pixels.",
                "Class transitions describe what the model predicts, not a physical cause. Nothing here measures NDVI, emissions or land value.",
                "Basemap imagery is NASA GIBS MODIS (250 m) — context, not the analysis input.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-warn/80" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl border border-line bg-bg-deep/60 p-4 font-mono text-[10.5px] leading-relaxed text-muted">
              <p className="text-primary/80">$ senseearth serve</p>
              <p className="mt-1.5">API · http://localhost:8000</p>
              <p>WEB · http://localhost:5173</p>
              <p className="mt-1.5 text-muted/70">checkpoint · models/weights/pspnet_hrnet_w18.pth</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- cta */}
      <section className="relative overflow-hidden py-20">
        <div className="se-glow pointer-events-none absolute inset-0 opacity-60" />
        <motion.div {...fadeUp} className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h2 className="text-[30px] font-semibold tracking-tight text-ink sm:text-[40px]">
            Point it at a place you already understand.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[13.5px] leading-relaxed text-muted">
            Start with the shipped demo pair, then upload your own. Every number in the interface
            traces back to a mask the model actually produced.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button to="/app/new" variant="primary" size="lg" iconRight={<ArrowRight className="size-4" />}>
              Open New Analysis
            </Button>
            <Button to="/login" variant="outline" size="lg">
              Sign in with the demo account
            </Button>
          </div>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">
            demo@senseearth.app · senseearth
          </p>
        </motion.div>
      </section>

      <MarketingFooter />
    </div>
  );
}
