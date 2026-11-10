import clsx from "clsx";
import {
  Activity,
  Archive,
  ChevronLeft,
  Globe2,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  ScanLine,
  Search,
  Settings,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo, LogoMark } from "@/components/ui";
import { CosmicOrb } from "@/components/visuals/CosmicOrb";
import { useHealth } from "@/hooks/useSystem";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";

const iconMap = {
  home: Home,
  globe: Globe2,
  scan: ScanLine,
  dashboard: LayoutDashboard,
  activity: Activity,
  archive: Archive,
  sparkles: Sparkles,
  settings: Settings,
} as const;

interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof iconMap;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/app", label: "Home", icon: "home", end: true },
  { to: "/app/explore", label: "Explore Earth", icon: "globe" },
  { to: "/app/new", label: "New Analysis", icon: "scan" },
  { to: "/app/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/app/monitoring", label: "Monitoring", icon: "activity" },
  { to: "/app/reports", label: "Reports", icon: "archive" },
  { to: "/app/insights", label: "AI Insights", icon: "sparkles" },
  { to: "/app/settings", label: "Settings", icon: "settings" },
];

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/app/results/")) return "Analysis results";
  if (pathname.startsWith("/app/insights/")) return "AI Insights";
  return NAV.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))?.label ?? "Workspace";
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const { data } = useHealth();

  const initials = useMemo(
    () =>
      (user?.name ?? "SenseEarth User")
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join(""),
    [user?.name],
  );

  return (
    <div className="flex h-full flex-col">
      <div className={clsx("flex h-[74px] items-center border-b border-[#33362A] px-4", collapsed && "justify-center px-2")}>
        <Logo compact={collapsed} />
      </div>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-2.5 pb-4" aria-label="Primary">
        {NAV.map((item) => {
          const Icon = iconMap[item.icon];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                clsx(
                  "group relative flex items-center gap-3 rounded-full py-2.5 text-[13px] transition-all duration-200",
                  collapsed ? "justify-center px-0" : "px-3.5",
                  isActive
                    ? "bg-primary font-medium text-primary-ink shadow-[0_10px_30px_-14px_rgba(198,243,107,0.8)]"
                    : "text-[#F3F0E7] hover:bg-[#F3F0E7]/10 hover:text-[#F3F0E7]",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx("size-[17px] shrink-0", isActive ? "text-primary-ink" : "text-[#D8D8CB] group-hover:text-[#F3F0E7]")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="relative mx-2.5 mb-3 overflow-hidden rounded-2xl border border-[#33362A] bg-[#F3F0E7]/[0.04]">
          <CosmicOrb className="absolute -right-6 -top-6 size-24 opacity-70" rings={false} particles={false} interactive={false} speed={0.5} intensity={0.9} />
          <div className="relative p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#C5C5B8]">
              {data?.model.available ? "Inference engine" : "Engine offline"}
            </p>
            <p className="mt-1 truncate text-[11.5px] text-[#F3F0E7]">{data?.model.name ?? "Checking model…"}</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-[#C5C5B8]">
              {data?.model.device ?? "—"} · {data?.model.loaded ? "resident" : "on demand"}
            </p>
          </div>
        </div>
      )}

      <div className={clsx("border-t border-[#33362A] p-3", collapsed && "px-2")}>
        <div className={clsx("flex items-center gap-2.5 rounded-xl px-1 py-1", collapsed && "justify-center")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 font-mono text-[11px] font-semibold text-primary">
            {initials || "SE"}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-[#F3F0E7]">{user?.name ?? "Account"}</p>
              <p className="truncate text-[10.5px] text-[#C5C5B8]">{user?.organization ?? user?.email ?? "Signed in"}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/");
          }}
          className={clsx(
            "mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-[12px] text-[#C5C5B8] transition-colors hover:bg-[#F3F0E7]/10 hover:text-[#F3F0E7]",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="size-3.5" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar } = useUiStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((state) => state.user);
  const { data: health } = useHealth();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = titleForPath(location.pathname);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside
        className={clsx(
          "sticky top-0 hidden h-screen shrink-0 border-r border-line/70 bg-[#151711] transition-[width] duration-300 lg:block",
          sidebarCollapsed ? "w-[76px]" : "w-[252px]",
        )}
      >
        <SidebarBody collapsed={sidebarCollapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[270px] border-r border-line bg-[#151711]">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-5 rounded-lg p-1.5 text-muted hover:text-ink"
            >
              <X className="size-4" />
            </button>
            <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-[74px] items-center gap-3 border-b border-line/70 bg-bg/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-line p-2 text-muted lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>
          <button
            onClick={toggleSidebar}
            className="hidden rounded-lg border border-line p-2 text-muted transition-colors hover:text-ink lg:block"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={clsx("size-4 transition-transform", sidebarCollapsed && "rotate-180")} />
          </button>

          <p className="hidden truncate text-[13px] text-ink-soft md:block">{title}</p>

          <form
            className="ml-auto w-full max-w-[420px]"
            onSubmit={(event) => {
              event.preventDefault();
              const query = search.trim();
              navigate(query ? `/app/reports?q=${encodeURIComponent(query)}` : "/app/reports");
            }}
            role="search"
          >
            <label className="relative block">
              <span className="sr-only">Search analyses and regions</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search analyses, regions and dates…"
                className="h-10 w-full rounded-full border border-line bg-ivory/[0.04] pl-10 pr-16 text-[12.5px] text-ink placeholder:text-muted/80 focus:border-primary/50 focus:bg-ivory/[0.06] focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[9px] text-muted sm:flex">
                CTRL K
              </span>
            </label>
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <button
              onClick={toggleTheme}
              className="rounded-full border border-line p-2 text-muted transition-colors hover:text-ink"
              aria-label={theme === "dark" ? "Switch to the ivory theme" : "Switch to the obsidian theme"}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link
              to="/app/new"
              className="hidden items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-ink transition-opacity hover:opacity-90 sm:flex"
            >
              <Plus className="size-3.5" />
              Compare captures
            </Link>
            <Link
              to="/app/settings"
              aria-label="Your profile"
              className="flex size-9 items-center justify-center rounded-full border border-primary/40 bg-primary/15 font-mono text-[11px] font-semibold text-primary"
            >
              {(user?.name ?? "SE").slice(0, 2).toUpperCase()}
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1380px]">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-line/70 px-4 py-4 text-[11px] text-muted sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <LogoMark className="size-4 text-muted" />
              SenseEarth · research build
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em]">
              API {health?.version ?? "—"} · DB {health?.database ?? "—"} · {health?.queue.active ?? 0} active jobs
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
