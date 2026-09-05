import { Link, Outlet, useLocation } from "react-router-dom";
import { useWorkspace } from "@lib/store/workspace";
import { activeRun } from "@lib/store/selectors";
import { describeProgress } from "@lib/store/progress";
import { useEffect } from "react";
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

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="va-app">
      <Rail />
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
