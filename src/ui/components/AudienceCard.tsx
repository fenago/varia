import { Link } from "react-router-dom";
import { Blueprint } from "./Blueprint";

export interface AudienceCardProps {
  /** "For students" */
  label: string;
  promise: string;
  quote: string;
  to: string;
  className?: string;
}

/** A blueprint card: kicker label, the promise as an 18px heading, the quote in italics, "Read more →". */
export function AudienceCard({ label, promise, quote, to, className }: AudienceCardProps) {
  return (
    <Blueprint className={["va-audience", className].filter(Boolean).join(" ")}>
      <div className="va-kicker">{label}</div>
      <div className="va-audience-promise">{promise}</div>
      <p className="va-audience-quote text-muted">“{quote}”</p>
      <Link to={to} className="va-audience-more">
        Read more →
      </Link>
    </Blueprint>
  );
}
