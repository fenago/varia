export interface LikertRowProps {
  /** The question text, shown on the left. */
  label: string;
  /** Radio group name, unique per question. */
  name: string;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Optional end-point captions under the scale, e.g. ["Disagree", "Agree"]. */
  ends?: [string, string];
}

/** One survey row: question on the left, a 1–5 `.seg` control on the right. */
export function LikertRow({ label, name, value, onChange, disabled, ends = ["Disagree", "Agree"] }: LikertRowProps) {
  return (
    <div className="va-likert">
      <div className="va-likert-label">{label}</div>
      <div className="va-likert-scale">
        <div className="seg" role="radiogroup" aria-label={label} style={{ width: "100%" }}>
          {[1, 2, 3, 4, 5].map((o) => (
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
        <div className="va-likert-ends">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      </div>
    </div>
  );
}
