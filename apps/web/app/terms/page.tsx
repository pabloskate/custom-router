import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | CustomRouter",
  description: "Starter Terms of Service for CustomRouter deployments.",
};

const SERVICE_RULES = [
  "Do not use the service for unlawful, abusive, or fraudulent activity.",
  "Do not attempt to bypass rate limits, authentication, or service restrictions.",
  "Do not submit content you do not have the right to process.",
  "You remain responsible for prompts, uploaded content, and downstream use of model output.",
] as const;

const DISCLAIMER_ITEMS = [
  "Model output can be inaccurate, incomplete, or inappropriate for your use case.",
  "The service may rely on third-party upstream model providers and can degrade or fail when those providers do.",
  "Availability, model selection, routing behavior, and limits may change without notice.",
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

export default function TermsPage() {
  return (
    <div className="quickstart-page legal-page">
      <section className="quickstart-hero">
        <span className="badge badge--info">Legal template</span>
        <h1>Terms of Service</h1>
        <p>
          These starter terms govern access to the CustomRouter service and related APIs. They
          are a practical default for early setup, but you should replace or revise them before
          serving external customers or collecting regulated data.
        </p>
        <div className="quickstart-actions">
          <Link className="btn" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="btn btn--secondary" href="/admin">
            Back to Admin
          </Link>
        </div>
      </section>

      <section className="legal-grid">
        <article className="card">
          <div className="card-header">
            <h2>1. Use of the service</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              You may use this service only in compliance with applicable law and these terms.
              Access may be suspended or revoked if use creates operational, legal, or security
              risk.
            </p>
            <BulletList items={SERVICE_RULES} />
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>2. Accounts and API keys</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              You are responsible for activity under your account, session, and API keys. Keep
              credentials confidential and revoke them promptly if you suspect compromise.
            </p>
            <p>
              We may impose rate limits, usage caps, model restrictions, or other controls to
              protect the service and upstream providers.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>3. Your content</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              You retain rights to content you submit, to the extent you already own those
              rights. You grant the service a limited right to process that content for routing,
              safety, logging, abuse prevention, and request fulfillment.
            </p>
            <p>
              Do not send sensitive or regulated data unless you have independently confirmed the
              deployment, storage, retention, and upstream provider terms are appropriate.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>4. AI-specific disclaimers</h2>
          </div>
          <div className="card-body legal-copy">
            <BulletList items={DISCLAIMER_ITEMS} />
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>5. Termination</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              We may suspend or terminate access at any time to protect the service, comply with
              law, or respond to abuse, unpaid usage, or upstream provider restrictions.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>6. Warranty and liability</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the
              maximum extent allowed by law, we disclaim warranties and are not liable for
              indirect, incidental, special, consequential, exemplary, or lost-profit damages.
            </p>
          </div>
        </article>
      </section>

      <section className="alert alert--warning quickstart-note">
        <div>
          <strong>Before you publish this</strong>
          <p>
            Replace this starter copy with business-specific terms covering your entity name,
            billing, governing law, support commitments, and a real contact method.
          </p>
        </div>
      </section>
    </div>
  );
}
