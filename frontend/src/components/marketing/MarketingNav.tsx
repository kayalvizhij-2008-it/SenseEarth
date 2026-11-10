import { Moon, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Logo } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";

export function MarketingNav() {
  const token = useAuthStore((state) => state.token);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <Logo to="/" />
        <nav className="ml-4 hidden items-center gap-6 text-[12.5px] text-muted lg:flex">
          <a href="#output" className="transition-colors hover:text-ink">
            Output
          </a>
          <a href="#pipeline" className="transition-colors hover:text-ink">
            How it works
          </a>
          <a href="#classes" className="transition-colors hover:text-ink">
            Classes
          </a>
          <a href="#model" className="transition-colors hover:text-ink">
            Model
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:text-ink"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          {!token && (
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-[12.5px] text-ink-soft transition-colors hover:text-ink sm:block"
            >
              Sign in
            </Link>
          )}
          <Button to={token ? "/app" : "/login"} variant="primary" size="sm" className="h-9">
            {token ? "Open workspace" : "Launch workspace"}
          </Button>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-bg-deep/60">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <Logo to="/" />
            <p className="max-w-xs text-[12.5px] leading-relaxed text-muted">
              A working research build of the SenseEarth change-detection model, packaged as a
              reviewable analysis workflow.
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted/70">
              PSPNet · HRNet-W18 · 6 change classes
            </p>
          </div>
          <div className="space-y-2.5">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-soft">Product</p>
            {[
              ["Workspace", "/app"],
              ["New analysis", "/app/new"],
              ["Explore Earth", "/app/explore"],
              ["Reports", "/app/reports"],
            ].map(([label, to]) => (
              <Link key={to} to={to} className="block text-[12.5px] text-muted transition-colors hover:text-ink">
                {label}
              </Link>
            ))}
          </div>
          <div className="space-y-2.5">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-soft">Reference</p>
            <a href="#classes" className="block text-[12.5px] text-muted transition-colors hover:text-ink">
              Class palette
            </a>
            <a href="#model" className="block text-[12.5px] text-muted transition-colors hover:text-ink">
              Model card
            </a>
            <Link to="/app/settings" className="block text-[12.5px] text-muted transition-colors hover:text-ink">
              System status
            </Link>
          </div>
          <div className="space-y-2.5">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-soft">Data</p>
            <p className="text-[12.5px] leading-relaxed text-muted">
              Basemaps: NASA GIBS (public domain) and OpenStreetMap.
            </p>
            <p className="text-[12.5px] leading-relaxed text-muted">
              Model outputs are estimates, not surveyed measurements.
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[11px] text-muted">
          <span>© {new Date().getFullYear()} SenseEarth research build</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
            Original research code and weights preserved
          </span>
        </div>
      </div>
    </footer>
  );
}
