import { ArrowLeft, Compass, ScanLine } from "lucide-react";
import { Button } from "@/components/ui";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingNav";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle("Page not found");

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <MarketingNav />
      <main className="relative flex flex-1 items-center overflow-hidden">
        <div className="se-grid-bg pointer-events-none absolute inset-0 opacity-60" />
        <div className="se-glow pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-24 text-center sm:px-8">
          <p className="font-mono text-[72px] leading-none tracking-tight text-primary/25 sm:text-[110px]">404</p>
          <div className="-mt-6 space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary/80">off the map</p>
            <h1 className="text-[30px] font-semibold tracking-tight text-ink sm:text-[38px]">
              No scene here.
            </h1>
            <p className="mx-auto max-w-md text-[13.5px] leading-relaxed text-muted">
              This route does not exist in the workspace. The tile you were looking for may have been
              deleted, or the link may be stale.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button to="/app" variant="primary" icon={<ArrowLeft className="size-4" />}>
              Back to dashboard
            </Button>
            <Button to="/app/explore" variant="outline" icon={<Compass className="size-4" />}>
              Explore Earth
            </Button>
            <Button to="/app/new" variant="ghost" icon={<ScanLine className="size-4" />}>
              New analysis
            </Button>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
