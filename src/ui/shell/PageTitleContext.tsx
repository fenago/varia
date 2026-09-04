import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface PageMeta {
  crumb: string;
  title: string;
}

interface PageTitleCtx {
  override: PageMeta | null;
  setOverride: (m: PageMeta | null) => void;
}

const Ctx = createContext<PageTitleCtx>({ override: null, setOverride: () => {} });

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<PageMeta | null>(null);
  return <Ctx.Provider value={{ override, setOverride }}>{children}</Ctx.Provider>;
}

/** Read the current override (used by the header). */
export function usePageTitleOverride(): PageMeta | null {
  return useContext(Ctx).override;
}

/**
 * Let a page replace the header title (and optionally the crumb) while it is
 * mounted, e.g. `usePageTitle("Integrity report — Model card audit")`.
 * Pass `null`/`undefined` to keep the route default.
 */
export function usePageTitle(title?: string | null, crumb?: string | null): void {
  const { setOverride } = useContext(Ctx);
  useEffect(() => {
    if (!title && !crumb) {
      setOverride(null);
      return;
    }
    setOverride({ title: title ?? "", crumb: crumb ?? "" });
    return () => setOverride(null);
  }, [title, crumb, setOverride]);
}
