import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, QrCode, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/ui";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="sg-hatch">
      <header className="sg-topbar">
        <BrandMark />
        <div className="sg-cta-row">
          <Link to="/login" className="sg-btn sg-btn-ghost">
            Manager console
          </Link>
          <Link to="/worker" className="sg-btn sg-btn-primary">
            Scan a room QR
          </Link>
        </div>
      </header>

      <section className="sg-hero">
        <div>
          <div className="sg-kicker">Construction site access</div>
          <h1>Room access, without the clipboard.</h1>
          <p className="sg-lede">
            Workers scan a door QR, verify by SMS, and wait for a manager. Every
            visit is photographed, timed, and stored for audit.
          </p>
          <div className="sg-cta-row">
            <Link to="/worker" className="sg-btn sg-btn-primary">
              I am on site
            </Link>
            <Link to="/login" className="sg-btn sg-btn-ghost">
              I approve requests
            </Link>
          </div>
        </div>
        <aside className="sg-panel">
          <h2>How a visit works</h2>
          <div className="sg-step-list">
            {[
              ["Scan", "Room QR on the door."],
              ["Verify", "Phone number + one-time SMS code."],
              ["Request", "Reason, trade, and company."],
              ["Approve", "Site manager reviews in the console."],
              ["Leave", "Photo of the room, then clock out."],
            ].map(([title, body], i) => (
              <div className="sg-step-item" key={title}>
                <div className="sg-step-num">{i + 1}</div>
                <div>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="sg-band">
        <div className="sg-band-inner">
          <div>
            <div className="sg-band-icon">
              <QrCode size={18} />
            </div>
            <h3>No app login for trades</h3>
            <p>
              A worker only needs a phone. Scan, SMS, form. If they already have
              an approved visit, the same QR clocks them out.
            </p>
          </div>
          <div>
            <div className="sg-band-icon">
              <ShieldCheck size={18} />
            </div>
            <h3>Named approvals</h3>
            <p>
              Managers see who, which room, why, and can approve or reject with
              a comment. The worker is notified by SMS.
            </p>
          </div>
          <div>
            <div className="sg-band-icon">
              <ClipboardCheck size={18} />
            </div>
            <h3>Audit by default</h3>
            <p>
              Clock in, clock out, photos, comments, and events stay attached to
              the room — ready for reporting.
            </p>
          </div>
        </div>
      </section>

      <footer className="sg-foot">
        <span>SiteGate · live site access</span>
        <Link to="/signup">Create a manager account</Link>
      </footer>
    </div>
  );
}
