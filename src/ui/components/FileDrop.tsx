import { useRef, useState, type DragEvent, type ReactNode } from "react";
/* type-scale: applied */
import { Blueprint, BlueprintButton } from "./Blueprint";

export interface FileDropProps {
  onFiles: (files: File[]) => void;
  heading?: string;
  text?: ReactNode;
  /** Accepted extensions, e.g. ".docx,.pdf,.txt,.md,.csv" */
  accept?: string;
  /** Extra buttons rendered after "Browse files". */
  actions?: ReactNode;
  browseLabel?: string;
  disabled?: boolean;
}

/** The drop zone from the Import page: accent-100 blueprint with drag/drop + hidden file input. */
export function FileDrop({
  onFiles,
  heading = "Drop your assignment here",
  text = "Word, PDF, plain text, or a Canvas assignment link. Add the rubric and your model answer if they are separate files.",
  accept = ".docx,.pdf,.txt,.md,.csv",
  actions,
  browseLabel = "Browse files",
  disabled,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onFiles(files);
  }

  return (
    <Blueprint
      className={["va-drop", over ? "is-over" : ""].filter(Boolean).join(" ")}
      onDragOver={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      aria-disabled={disabled || undefined}
    >
      <div className="va-heading-22" style={{ marginBottom: 6 }}>
        {heading}
      </div>
      <p className="text-muted" style={{ margin: "0 0 16px", fontSize: 15.5 }}>
        {text}
      </p>
      <div className="va-drop-actions">
        <BlueprintButton onClick={() => inputRef.current?.click()} disabled={disabled}>
          {browseLabel}
        </BlueprintButton>
        {actions}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </Blueprint>
  );
}
