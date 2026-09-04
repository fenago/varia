import { useRef, useState } from "react";

export interface CopyFieldProps {
  label: string;
  value: string;
  buttonLabel?: string;
  /** Extra hint under the field. */
  hint?: string;
}

/** Read-only input with a Copy button. Shows "Copied" for 2 s; falls back to selecting the text. */
export function CopyField({ label, value, buttonLabel = "Copy", hint }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      ref.current?.focus();
      ref.current?.select();
    }
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div className="va-copyfield">
        <input ref={ref} className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-secondary" onClick={copy}>
          {copied ? "Copied" : buttonLabel}
        </button>
      </div>
      {hint && <div className="text-muted va-muted-12" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
