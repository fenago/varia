import { useEffect, type ReactNode } from "react";
import { Blueprint } from "./Blueprint";

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  /** Buttons rendered in `.dialog-actions` */
  actions: ReactNode;
  onClose: () => void;
}

/** Modal over a backdrop at the top elevation. Escape / backdrop click closes. */
export function Dialog({ open, title, children, actions, onClose }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="va-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Blueprint className="va-dialog dialog" role="dialog" aria-modal="true">
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </Blueprint>
    </div>
  );
}
