import { useLocation } from "react-router-dom";
import { GENERATOR_MODELS } from "@shared/types";
import { useSettings } from "@lib/store/settings";
import { PAGES, pageKeyForPath } from "../router";
import { usePageTitleOverride } from "./PageTitleContext";

export function Header() {
  const { pathname } = useLocation();
  const key = pageKeyForPath(pathname);
  const base = PAGES[key];
  const override = usePageTitleOverride();
  const crumb = override?.crumb || base.crumb;
  const title = override?.title || base.title;

  const settings = useSettings();
  const mode = settings?.mode ?? "demo";
  const modelId = settings?.generatorModel;
  const modelLabel = GENERATOR_MODELS.find((m) => m.id === modelId)?.label ?? modelId ?? "";

  return (
    <header className="va-header">
      <div className="va-header-left">
        <div className="va-crumb">{crumb}</div>
        <h4>{title}</h4>
      </div>
      <div className="va-header-right">
        {mode === "live" && modelLabel ? (
          <span className="tag tag-accent" title="Generator model from Settings">
            {modelLabel}
          </span>
        ) : null}
      </div>
    </header>
  );
}
