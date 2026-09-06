import { JourneyInfographic } from "@ui/components";
import { usePageTitle } from "@ui/shell/PageTitleContext";

export default function Journey() {
  usePageTitle("VARIA, in one picture", "Orientation");
  return (
    <div className="va-page" style={{ gap: 18, maxWidth: 1400 }}>
      <p className="va-no-print" style={{ margin: 0, fontSize: 16, lineHeight: 1.6, maxWidth: "70ch" }}>
        The whole idea on one page: an employer's problem goes in, and a record a student can share comes out. Seven steps, in order. Download it for a slide or print it for a meeting.
      </p>
      <JourneyInfographic />
    </div>
  );
}
