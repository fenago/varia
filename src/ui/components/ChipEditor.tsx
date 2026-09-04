import { useState, type KeyboardEvent } from "react";

export interface ChipEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  /** Placeholder / button text for the add control. Default "Add". */
  addLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Accessible name for the group. */
  label?: string;
}

/** Editable list of chips (a surface dimension's values): × to remove, input + Add to append. */
export function ChipEditor({ values, onChange, addLabel = "Add", placeholder = "New value", disabled, label }: ChipEditorProps) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="va-chips" role="group" aria-label={label}>
      <div className="va-tags">
        {values.map((v) => (
          <span key={v} className="tag tag-accent va-chip">
            {v}
            {!disabled && (
              <button
                type="button"
                className="va-chip-x"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {values.length === 0 && <span className="text-muted va-muted-12">Nothing yet.</span>}
      </div>
      {!disabled && (
        <div className="va-chip-add">
          <input
            className="input"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            aria-label={placeholder}
          />
          <button type="button" className="btn btn-secondary" onClick={add} disabled={!draft.trim()}>
            {addLabel}
          </button>
        </div>
      )}
    </div>
  );
}
