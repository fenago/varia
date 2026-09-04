export interface SegScaleProps {
  /** Radio group name (unique per criterion). */
  name: string;
  value: number | null;
  onChange: (value: number) => void;
  /** Options, default 0..3 */
  options?: number[];
  disabled?: boolean;
  /** Fill the container width (mockup: `.seg` with `width:100%`). Default true. */
  block?: boolean;
}

/** The 0–3 segmented rubric scale (`.seg` / `.seg-opt`). */
export function SegScale({ name, value, onChange, options = [0, 1, 2, 3], disabled, block = true }: SegScaleProps) {
  return (
    <div className="seg" style={block ? { width: "100%" } : undefined} role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label key={o} className="seg-opt" style={{ flex: 1, justifyContent: "center" }}>
          <input
            type="radio"
            name={name}
            value={o}
            checked={value === o}
            disabled={disabled}
            onChange={() => onChange(o)}
          />
          {o}
        </label>
      ))}
    </div>
  );
}

export interface SegChoiceProps<T extends string> {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  style?: React.CSSProperties;
}

/** A labelled segmented control (filters: All / Flagged / Awaiting sign-off). */
export function SegChoice<T extends string>({ name, value, onChange, options, className, style }: SegChoiceProps<T>) {
  return (
    <div className={["seg", className].filter(Boolean).join(" ")} style={style} role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label key={o.value} className="seg-opt">
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
