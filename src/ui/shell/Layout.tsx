import { Link, Outlet, useLocation } from "react-router-dom";
import { useWorkspace } from "@lib/store/workspace";
import { activeRun } from "@lib/store/selectors";
import { describeProgress } from "@lib/store/progress";
import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Rail } from "./Rail";
import { Header } from "./Header";

const IN_FLIGHT = new Set(["queued", "generating", "judging", "scoring"]);

/** Thin strip under the header while any run is in flight, so leaving the page never hides it. */
function RunStrip() {
  const ws = useWorkspace();
  const { pathname } = useLocation();
  const run = activeRun(ws);
  if (!run || !IN_FLIGHT.has(run.status) || pathname === "/generate") return null;
  const t = describeProgress(run.progress);
  return (
    <Link to="/generate" className="va-progress-strip" role="status" aria-live="polite">
      <span className="va-progress-compact-head">{t.headline}</span>
      <span className="text-muted">
        {run.progress.done} / {run.progress.total}
        {t.eta ? ` · ${t.eta}` : ""}
        {run.usage && run.usage.calls > 0 ? ` · $${run.usage.costUsd.toFixed(2)} so far` : ""}
      </span>
      <div className="va-progress" aria-hidden="true">
        <div className="va-progress-fill is-running" style={{ width: `${t.pct}%` }} />
      </div>
      <span className="va-strip-link">Open the run →</span>
    </Link>
  );
}

/** Top bar shown below 900px: logo, wordmark, and the menu button that opens the rail as a drawer. */
function MobileBar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="va-mobilebar">
      <Link to="/" className="va-mobilebar-brand" aria-label="VARIA home">
        <img src="/mdc-logo.png" alt="" width={110} height={26} decoding="async" />
        <span className="va-mobilebar-word">VARIA</span>
      </Link>
      <button
        type="button"
        className="va-mobilebar-menu"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="va-rail"
        aria-label={open ? "Close navigation" : "Open navigation"}
      >
        <Menu size={22} strokeWidth={1.5} />
        <span>Menu</span>
      </button>
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setOpen(false);
  }, [pathname]);

  // Drawer: Esc closes, body scroll locks, focus moves into the drawer and back out.
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const rail = document.getElementById("va-rail");
    const first = rail?.querySelector<HTMLElement>("a, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && rail) {
        const focusables = Array.from(rail.querySelectorAll<HTMLElement>("a, button")).filter((el) => !el.hasAttribute("disabled"));
        if (!focusables.length) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocus.current?.focus?.();
    };
  }, [open]);

  return (
    <div className={`va-app${open ? " is-drawer-open" : ""}`}>
      <MobileBar open={open} onToggle={() => setOpen((o) => !o)} />
      {open ? <div className="va-drawer-backdrop" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <Rail open={open} onClose={() => setOpen(false)} />
      <main className="va-main">
        <Header />
        <RunStrip />
        <div className="va-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
