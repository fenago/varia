import type { SkillTag } from "@shared/types";

export interface SkillTagsProps {
  skills: (SkillTag | string)[];
  /** Show at most this many chips, then "+n" */
  max?: number;
  className?: string;
}

function labelOf(s: SkillTag | string): string {
  return typeof s === "string" ? s : s.label;
}
function keyOf(s: SkillTag | string): string {
  return typeof s === "string" ? s : s.key;
}

/** Skill chips as `tag tag-outline`, with "+n" overflow. */
export function SkillTags({ skills, max, className }: SkillTagsProps) {
  const shown = max != null ? skills.slice(0, max) : skills;
  const rest = skills.length - shown.length;
  if (skills.length === 0) return <span className="va-muted-12">no skills tagged</span>;
  return (
    <span className={["va-tags", className].filter(Boolean).join(" ")}>
      {shown.map((s) => (
        <span key={keyOf(s)} className="tag tag-outline" title={typeof s === "string" ? undefined : s.externalRef}>
          {labelOf(s)}
        </span>
      ))}
      {rest > 0 && (
        <span className="tag tag-outline" title={skills.slice(shown.length).map(labelOf).join(", ")}>
          +{rest}
        </span>
      )}
    </span>
  );
}
