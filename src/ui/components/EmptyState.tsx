import type { ReactNode } from "react";
/* type-scale: applied */
import { Blueprint, BlueprintButton } from "./Blueprint";

export interface EmptyStateProps {
  heading: string;
  text: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Extra secondary content (links, buttons). */
  children?: ReactNode;
}

/** A blueprint box for "nothing here yet" states with a primary action. */
export function EmptyState({ heading, text, actionLabel, onAction, children }: EmptyStateProps) {
  return (
    <Blueprint style={{ padding: "26px 28px", maxWidth: 640 }}>
      <div className="va-heading-22" style={{ marginBottom: 6 }}>
        {heading}
      </div>
      <p className="text-muted" style={{ margin: "0 0 16px", fontSize: 15.5, lineHeight: 1.6 }}>
        {text}
      </p>
      <div className="va-btn-row">
        {actionLabel && onAction && <BlueprintButton onClick={onAction}>{actionLabel}</BlueprintButton>}
        {children}
      </div>
    </Blueprint>
  );
}
