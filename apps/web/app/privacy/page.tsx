import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | CustomRouter",
  description: "Starter Privacy Policy for CustomRouter deployments.",
};

const DATA_TYPES = [
  "Account details such as name, email address, hashed password, and session metadata.",
  "API metadata such as request timestamps, request identifiers, thread identifiers, model routing decisions, and operational logs.",
  "User-submitted prompts, messages, and other content needed to process requests.",
  "Security and abuse-prevention data such as IP-based rate limiting counters and audit events.",
] as const;

const DATA_USES = [
  "Authenticate users, manage accounts, and issue or revoke API keys.",
  "Route requests across models, persist thread pins, and troubleshoot service behavior.",
  "Detect abuse, enforce limits, maintain uptime, and improve reliability.",
  "Comply with legal obligations and protect the service, users, and upstream providers.",
] as const;

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="quickstart-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <div className="quickstart-page legal-page">
      <section className="quickstart-hero">
        <span className="badge badge--info">Legal template</span>
        <h1>Privacy Policy</h1>
        <p>
          This starter policy explains the categories of data processed by a CustomRouter
          deployment. It is meant to help you get the product live, not to replace legal review
          for your business, jurisdiction, or customer contracts.
        </p>
        <div className="quickstart-actions">
          <Link className="btn" href="/terms">
            Terms of Service
          </Link>
          <Link className="btn btn--secondary" href="/admin">
            Back to Admin
          </Link>
        </div>
      </section>

      <section className="legal-grid">
        <article className="card">
          <div className="card-header">
            <h2>1. Information we collect</h2>
          </div>
          <div className="card-body legal-copy">
            <BulletList items={DATA_TYPES} />
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>2. How we use information</h2>
          </div>
          <div className="card-body legal-copy">
            <BulletList items={DATA_USES} />
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>3. Sharing and processors</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              Requests may be sent to third-party model and infrastructure providers as needed to
              operate the service. Those providers may process prompts, metadata, and generated
              output under their own terms and privacy practices.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>4. Retention</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              We keep data only for as long as reasonably necessary to operate the service,
              investigate incidents, comply with law, or enforce our terms. Retention periods may
              vary by data type, deployment configuration, and upstream provider behavior.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>5. Security</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              We use reasonable administrative, technical, and organizational measures to protect
              data, but no system is completely secure. You should avoid sending highly sensitive
              information unless you have verified the deployment meets your requirements.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>6. Your choices</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              Depending on your jurisdiction and account type, you may be able to request access,
              correction, deletion, or export of certain personal data. Operational and security
              logs may be retained where necessary for legitimate business or legal reasons.
            </p>
          </div>
        </article>
      </section>

      <section className="alert alert--warning quickstart-note">
        <div>
          <strong>Before you publish this</strong>
          <p>
            Add your business name, contact email, subprocessors, retention periods, regional
            disclosures, and cookie or analytics details if you use them.
          </p>
        </div>
      </section>
    </div>
  );
}
