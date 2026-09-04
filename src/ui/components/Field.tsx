import type { CSSProperties, ReactNode } from "react";

export interface FieldProps {
  label: ReactNode;
  /** Muted trailing hint after the label, e.g. "— extracted from your prompt, high confidence" */
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** `.field` + label + control. Put an `.input` element inside. */
export function Field({ label, hint, htmlFor, children, className, style }: FieldProps) {
  return (
    <div className={["field", className].filter(Boolean).join(" ")} style={style}>
      <label htmlFor={htmlFor}>
        {label}
        {hint != null && <span className="text-muted"> {hint}</span>}
      </label>
      {children}
    </div>
  );
}
