import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { PAGES, pageKeyForPath } from "../router";
import { usePageTitleOverride } from "./PageTitleContext";

/**
 * Employer-facing chrome for /review and /evidence. No instructor rail, no
 * course tag, no demo-mode chip. Pages set the right-hand context line via
 * `usePageTitle(title, crumb)` — the crumb is rendered as the context slot in
 * the top bar (e.g. "Reviewing for Northline Talent Systems") and the title
 * as the page heading.
 */
export function ReviewLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const key = pageKeyForPath(pathname);
  const base = PAGES[key];
  const override = usePageTitleOverride();
  const crumb = override?.crumb || base.crumb;
  const title = override?.title || base.title;

  return (
    <div className="va-review">
      <header className="va-review-bar va-no-print">
        <div className="va-review-brand">
          <img src="/mdc-logo.png" alt="Miami Dade College" width={165} height={39} decoding="async" />
          <span className="va-review-word">
            VARIA <span className="va-review-word-sub">· Assessment evidence</span>
          </span>
        </div>
        <div className="va-review-context">{override?.crumb ? override.crumb : ""}</div>
      </header>

      <main className="va-review-main">
        <div className="va-review-head">
          <div className="va-crumb">{crumb}</div>
          <h4>{title}</h4>
        </div>
        <Outlet />
      </main>

      <footer className="va-review-foot va-no-print">
        Miami Dade College · AI Assessment Grant · nothing on this page is stored anywhere but your browser
      </footer>
    </div>
  );
}
