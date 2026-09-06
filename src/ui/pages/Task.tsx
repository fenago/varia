import { useEffect, useMemo, useState } from "react";
/* type-scale: applied */
import { useParams } from "react-router-dom";
import { Blueprint, EmptyState } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { useWorkspace } from "@lib/store/workspace";
import { decodePackage, readFragmentParam } from "@lib/share";
import { buildTaskPackage, taskAsText, type TaskPackage } from "@lib/release/taskPackage";

function paragraphs(text: string) {
  return text
    .split(/\n{2,}|\n(?=[A-Z*\-•\d])/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * The student's page. Renders a TaskPackage carried in `#pkg=` (works in any
 * browser) or, failing that, the variant from this workspace. Stores nothing.
 */
export default function Task() {
  const { variantId } = useParams<{ variantId: string }>();
  const ws = useWorkspace();
  const [fromLink, setFromLink] = useState<TaskPackage | null | "loading" | "error">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const enc = readFragmentParam("pkg");
    if (!enc) {
      setFromLink(null);
      return;
    }
    decodePackage<TaskPackage>(enc)
      .then((p) => alive && setFromLink(p && p.version === 1 ? p : "error"))
      .catch(() => alive && setFromLink("error"));
    return () => {
      alive = false;
    };
  }, [variantId]);

  const pkg = useMemo<TaskPackage | null>(() => {
    if (fromLink && fromLink !== "loading" && fromLink !== "error") return fromLink;
    if (fromLink === "loading") return null;
    return variantId ? buildTaskPackage(ws, variantId) : null;
  }, [fromLink, ws, variantId]);

  usePageTitle(pkg ? pkg.blueprintName : "Your task", "Your task");

  if (fromLink === "loading") return <p className="text-muted">Opening your task…</p>;
  if (fromLink === "error" && !pkg) {
    return <EmptyState heading="This task link could not be read" text="Ask your instructor to send the link again, or open the file version they shared." />;
  }
  if (!pkg) {
    return <EmptyState heading="No task at this address" text="Your instructor's link carries your version of the task. Open it from the message they sent you." />;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(taskAsText(pkg));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* selectable text remains */
    }
  };

  return (
    <div className="va-page va-page-narrow" style={{ gap: 20 }}>
      <Blueprint className="va-print-block" style={{ padding: "24px 26px" }}>
        <div className="va-kicker">
          {pkg.course.code} · {pkg.course.term} · {pkg.course.title}
        </div>
        <h3 style={{ margin: "6px 0 6px", maxWidth: "34ch" }}>
          {pkg.blueprintName} <span className="text-muted" style={{ fontSize: 18, fontFamily: "var(--font-body)" }}>({pkg.maxPoints} points)</span>
        </h3>
        <div className="va-row-flex" style={{ gap: 10, flexWrap: "wrap", fontSize: 15 }}>
          {pkg.studentLabel ? <span>Prepared for {pkg.studentLabel}</span> : null}
          <span className="tag tag-accent">{pkg.variantId}</span>
          <span className="text-muted">Due: {pkg.dueLabel}</span>
          <div className="va-btn-row va-no-print" style={{ marginLeft: "auto" }}>
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print</button>
            <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? "Copied" : "Copy my task as text"}</button>
          </div>
        </div>
      </Blueprint>

      <Blueprint className="va-print-block" style={{ padding: "22px 24px" }}>
        <h6 style={{ margin: "0 0 10px" }}>Your task</h6>
        <div style={{ fontSize: 17, lineHeight: 1.65, maxWidth: "76ch" }}>
          {paragraphs(pkg.text).map((p, i) => (
            <p key={i} style={{ margin: "0 0 10px", textWrap: "pretty" }}>{p}</p>
          ))}
        </div>
      </Blueprint>

      <div className="va-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>What you must produce</h6>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, textWrap: "pretty" }}>{pkg.deliverable}</p>
        </Blueprint>
        <Blueprint className="va-print-block" style={{ padding: "20px 22px" }}>
          <h6 style={{ margin: "0 0 10px" }}>How it is graded</h6>
          <table className="table">
            <tbody>
              {pkg.rubric.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{c.points} pts</td>
                </tr>
              ))}
              <tr>
                <td className="va-heading-15">Total</td>
                <td className="va-heading-15" style={{ textAlign: "right" }}>{pkg.maxPoints} pts</td>
              </tr>
            </tbody>
          </table>
          <p className="text-muted" style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.5 }}>
            Every student in your section is graded on these same criteria. Your version of the scenario is yours alone.
          </p>
        </Blueprint>
      </div>

      <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
        Instructor: {pkg.instructorName}, {pkg.course.institution}. This page stores nothing; it shows the version carried in your link.
      </p>
    </div>
  );
}
