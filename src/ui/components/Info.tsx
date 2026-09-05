import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Info as InfoIcon } from "lucide-react";
import { glossaryTerm } from "@shared/glossary";

/**
 * <Info term="cosine" /> — a small "i" button that opens a plain-language popover.
 * <Term term="cosine">cosine 0.132</Term> — inline text with a dotted underline and the same popover.
 * Both render nothing when the slug is unknown, so a typo never crashes a page.
 */

export interface InfoProps {
  term: string;
  /** Extra class on the button */
  className?: string;
  /** Placement hint; the popover flips to stay on screen */
  align?: "start" | "end";
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, wrapRef };
}

function Popover({ slug, id, align, onClose }: { slug: string; id: string; align: "start" | "end"; onClose: () => void }) {
  const entry = glossaryTerm(slug);
  const [more, setMore] = useState(false);
  if (!entry) return null;
  return (
    <div role="dialog" aria-labelledby={`${id}-title`} className={`va-info-pop ${align === "end" ? "is-end" : ""}`}>
      <div className="va-info-pop-head">
        <span id={`${id}-title`} className="va-info-pop-term">{entry.term}</span>
        <button type="button" className="va-info-pop-close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <p className="va-info-pop-plain">{entry.plain}</p>
      {entry.more ? (
        more ? (
          <p className="va-info-pop-more">{entry.more}</p>
        ) : (
          <button type="button" className="va-info-pop-link" onClick={() => setMore(true)}>More</button>
        )
      ) : null}
      {entry.paper ? <div className="va-info-pop-paper">In the paper: {entry.paper}</div> : null}
      <Link to={`/glossary#${slug}`} className="va-info-pop-link">Glossary →</Link>
    </div>
  );
}

export function Info({ term, className, align = "start" }: InfoProps) {
  const entry = glossaryTerm(term);
  const id = useId();
  const { open, setOpen, wrapRef } = usePopover();
  if (!entry) return null;
  return (
    <span className={`va-info ${className ?? ""}`} ref={wrapRef}>
      <button
        type="button"
        className="va-info-btn"
        aria-label={`What is ${entry.term.toLowerCase()}?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <InfoIcon size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open ? <Popover slug={term} id={id} align={align} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

export interface TermProps {
  term: string;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
}

export function Term({ term, children, className, align = "start" }: TermProps) {
  const entry = glossaryTerm(term);
  const id = useId();
  const { open, setOpen, wrapRef } = usePopover();
  if (!entry) return <>{children}</>;
  return (
    <span className={`va-info va-term-wrap ${className ?? ""}`} ref={wrapRef}>
      <button
        type="button"
        className="va-term"
        aria-label={`What is ${entry.term.toLowerCase()}?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open ? <Popover slug={term} id={id} align={align} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}
