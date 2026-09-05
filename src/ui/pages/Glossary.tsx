import { Blueprint } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";
import { glossaryByGroup } from "@shared/glossary";

export default function Glossary() {
  usePageTitle("Glossary", "Orientation");
  const groups = glossaryByGroup();
  return (
    <div className="va-page va-page-narrow" style={{ gap: 22 }}>
      <Blueprint className="va-dark" style={{ padding: "22px 26px" }}>
        <div className="va-kicker">Plain words for every term</div>
        <h3 style={{ margin: "6px 0 8px", color: "#fff", maxWidth: "30ch" }}>What the words on each page mean</h3>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "#d5e0ea", maxWidth: "70ch" }}>
          Every term is explained in plain language first, with the research paper's wording after it. The small round "i" buttons across the app open the same entries.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
          {groups.map((g) => (
            <a key={g.group} href={`#group-${g.group.replace(/\s+/g, "-").toLowerCase()}`} className="btn va-btn-onDark" style={{ textDecoration: "none" }}>
              {g.group}
            </a>
          ))}
        </div>
      </Blueprint>

      {groups.map((g) => (
        <Blueprint key={g.group} className="va-glossary-group" id={`group-${g.group.replace(/\s+/g, "-").toLowerCase()}`} style={{ padding: "20px 24px", scrollMarginTop: 20 }}>
          <h6 style={{ margin: "0 0 4px" }}>{g.group}</h6>
          {g.entries.map(({ slug, entry }) => (
            <div key={slug} id={slug} className="va-glossary-entry">
              <div className="va-glossary-term">{entry.term}</div>
              <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.55, maxWidth: "76ch" }}>{entry.plain}</p>
              {entry.more ? <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 13, maxWidth: "76ch" }}>{entry.more}</p> : null}
              {entry.paper ? <div className="va-glossary-paper">In the paper: {entry.paper}</div> : null}
            </div>
          ))}
        </Blueprint>
      ))}
    </div>
  );
}
