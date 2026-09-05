import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspace } from "@lib/store/workspace";
import { useWalkthrough, currentStop, resolveRoute, onStopRoute } from "@lib/store/walkthrough";
import { WALKTHROUGH } from "@shared/walkthrough";
import { activeRun, rosterRows } from "@lib/store/selectors";
import { buildTaskPackage, taskLink } from "@lib/release";
import { Corners } from "./Blueprint";

const TARGET_CLASS = "va-walk-target";

function findTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-walk="${target}"]`);
}

/** The element to click for a target: the target itself if clickable, else its first button. */
function clickable(el: HTMLElement): HTMLElement {
  if (el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button") return el;
  return el.querySelector<HTMLElement>("button, a[href]") ?? el;
}

/**
 * The guided demo panel. Mounted once per layout. Renders nothing unless the
 * walkthrough is active. Highlights the stop's target, navigates to the stop's
 * page, and can perform the page's action for the user.
 */
export function Walkthrough() {
  const walk = useWalkthrough();
  const ws = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const stop = currentStop(walk.stepIndex);
  const [busy, setBusy] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");
  const [targetFound, setTargetFound] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const total = WALKTHROUGH.length;
  const isLast = walk.stepIndex === total - 1;

  const here = walk.active && onStopRoute(stop, ws, walk.sampleId, location.pathname);
  const wantPath = useMemo(() => (walk.active ? resolveRoute(stop, ws, walk.sampleId) : "/"), [walk.active, stop, ws, walk.sampleId]);

  // Go to the stop's page when the stop changes and we are not already there.
  useEffect(() => {
    if (!walk.active) return;
    if (!onStopRoute(stop, ws, walk.sampleId, location.pathname)) navigate(wantPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk.active, walk.stepIndex]);

  // Highlight the target; poll briefly because pages render after data loads.
  useEffect(() => {
    if (!walk.active || !here) {
      setTargetFound(false);
      return;
    }
    let scrolled = false;
    let tries = 0;
    const tick = () => {
      const el = findTarget(stop.target);
      if (el) {
        if (!el.classList.contains(TARGET_CLASS)) el.classList.add(TARGET_CLASS);
        setTargetFound(true);
        if (!scrolled) {
          scrolled = true;
          try {
            el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
          } catch {
            /* ignore */
          }
          // Keep the panel off the target: if the target sits on the right half, flip left.
          const r = el.getBoundingClientRect();
          setSide(r.right > window.innerWidth * 0.62 && r.bottom > window.innerHeight * 0.45 ? "left" : "right");
        }
      } else if (tries++ > 40) {
        setTargetFound(false);
      }
    };
    tick();
    // Re-apply on an interval: pages re-render and can replace the highlighted node.
    const timer = window.setInterval(tick, 400);
    return () => {
      window.clearInterval(timer);
      document.querySelectorAll(`.${TARGET_CLASS}`).forEach((n) => n.classList.remove(TARGET_CLASS));
    };
  }, [walk.active, walk.stepIndex, here, stop.target, location.pathname]);

  // Keyboard: Esc exits, arrows move.
  useEffect(() => {
    if (!walk.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") walk.exit();
      if (e.key === "ArrowRight" && stop.advance === "manual") walk.next();
      if (e.key === "ArrowLeft") walk.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walk, stop.advance]);

  if (!walk.active) return null;

  const nextStop = WALKTHROUGH[Math.min(total - 1, walk.stepIndex + 1)];

  async function doIt() {
    if (busy) return;
    setBusy(true);
    try {
      if (stop.action === "open-task") {
        const run = activeRun(ws);
        const row = run ? rosterRows(ws, run.id)[0] : null;
        if (run && row) {
          const pkg = buildTaskPackage(ws, row.variant.id, run.id);
          if (pkg) {
            const url = await taskLink(pkg);
            window.open(url, "_blank", "noopener");
          }
        }
        walk.next();
        return;
      }
      const el = findTarget(stop.target);
      if (el) clickable(el).click();
      // Wait until the next stop's page (or its target) is present, then advance.
      const deadline = Date.now() + 90_000;
      await new Promise<void>((resolve) => {
        const poll = () => {
          const wsNow = useWorkspace.getState();
          const there = onStopRoute(nextStop, wsNow, walk.sampleId, window.location.pathname);
          const tgt = there && findTarget(nextStop.target);
          const sameRoute = nextStop.route.kind === "path" && stop.route.kind === "path" && nextStop.route.path === stop.route.path;
          if ((there && !sameRoute) || tgt || Date.now() > deadline) return resolve();
          window.setTimeout(poll, 300);
        };
        poll();
      });
      walk.next();
    } finally {
      setBusy(false);
    }
  }

  const left = !here;

  return (
    <div
      ref={panelRef}
      className={`va-walk blueprint va-walk-${side}`}
      role="dialog"
      aria-live="polite"
      aria-label={`Walkthrough, stop ${walk.stepIndex + 1} of ${total}`}
      data-walk-panel
    >
      <Corners />
      <div className="va-walk-head">
        <span className="va-kicker">Walkthrough · stop {walk.stepIndex + 1} of {total}</span>
        <button type="button" className="btn btn-ghost va-walk-exit" onClick={walk.exit} aria-label="Exit the walkthrough">
          Exit
        </button>
      </div>
      <div className="va-walk-bar" aria-hidden="true">
        <i style={{ width: `${Math.round(((walk.stepIndex + 1) / total) * 100)}%` }} />
      </div>
      {left ? (
        <>
          <div className="va-walk-title">You left the walkthrough</div>
          <p className="va-walk-p">You can come back to where you were, or stop here and use VARIA normally.</p>
          <div className="va-walk-actions">
            <button type="button" className="btn btn-primary blueprint" onClick={() => navigate(wantPath)}>
              <Corners />
              Take me back
            </button>
            <button type="button" className="btn btn-secondary" onClick={walk.exit}>
              Exit
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="va-walk-title">{stop.title}</div>
          <p className="va-walk-p">
            <b>What just happened.</b> {stop.happened}
          </p>
          <p className="va-walk-p">
            <b>Why it matters.</b> {stop.why}
          </p>
          <p className="va-walk-p">
            <b>Do this now.</b> {stop.doNow}
          </p>
          {!targetFound && stop.target !== "promise" && stop.target !== "upload-own" ? (
            <p className="va-walk-p va-walk-note">Looking for the highlighted spot on this page…</p>
          ) : null}
          <div className="va-walk-actions">
            <button type="button" className="btn btn-ghost" onClick={walk.back} disabled={walk.stepIndex === 0 || busy}>
              Back
            </button>
            {stop.advance === "button" ? (
              <>
                <button type="button" className="btn btn-primary blueprint" onClick={() => void doIt()} disabled={busy}>
                  <Corners />
                  {busy ? "Working…" : stop.buttonLabel ?? "Do it for me"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={walk.next} disabled={busy} title="If you pressed the button yourself">
                  I did it, next
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary blueprint" onClick={isLast ? walk.exit : walk.next}>
                <Corners />
                {isLast ? "Finish" : "Next"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The entry button used on Home and Getting started. */
export function WalkthroughButton({ className, onDark }: { className?: string; onDark?: boolean }) {
  const start = useWalkthrough((s) => s.start);
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={`btn ${onDark ? "btn-primary blueprint" : "btn-primary blueprint"} ${className ?? ""}`}
      onClick={() => {
        start();
        navigate("/");
      }}
      data-walk="start-walkthrough"
    >
      <Corners />
      Walk me through a demo (nothing is spent)
    </button>
  );
}
