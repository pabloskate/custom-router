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
          These terms govern access to a CustomRouter deployment, including the admin console,
          OpenAI-compatible API endpoints, routing features, and any managed BYOK hosting or
          assisted self-hosting services the operator may provide. Replace the bracketed
          placeholders before external launch.
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

      <section className="alert alert--warning quickstart-note">
        <div>
          <strong>Operator details to fill in</strong>
          <p>
            Replace <code>[LEGAL ENTITY NAME]</code>, <code>[CONTACT EMAIL]</code>, and any
            billing or governing-law references with your real business details.
          </p>
        </div>
      </section>

      <section className="legal-grid">
        <article className="card">
          <div className="card-header">
            <h2>1. Use of the service</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              These Terms form an agreement between you and <strong>[LEGAL ENTITY NAME]</strong>
              {" "}(&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) for your use of this CustomRouter instance.
              The service may be offered as a self-hosted deployment, a managed BYOK-hosted
              deployment, or an assisted self-hosting engagement.
            </p>
            <p>
              You may use the service only in compliance with applicable law and these Terms.
              Access may be suspended or revoked if use creates operational, legal, or security
              risk for us, our infrastructure providers, or our upstream model providers.
            </p>
            <p>
              If your organization self-hosts this software, your organization is the service
              operator and is responsible for its own terms, privacy disclosures, security
              controls, and customer commitments.
            </p>
            <BulletList items={SERVICE_RULES} />
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>2. What the service does</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              CustomRouter is an OpenAI-compatible routing proxy. It accepts requests through API
              endpoints such as chat completions, responses, and model-listing routes, then may
              classify, route, retry, pin threads, and attach routing metadata before forwarding
              requests to one or more upstream model providers.
            </p>
            <p>
              Features may include admin-issued API keys, invite-only registration, configurable
              routing profiles, thread stickiness, guardrails, BYOK gateways, and stored routing
              explanations. Not every deployment enables every feature.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>3. Accounts and API keys</h2>
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
            <p>
              We may restrict account creation through closed or invite-only registration and may
              require admin approval for certain features, gateway changes, or elevated usage.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>4. Your content and BYOK credentials</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              You retain rights to content you submit, to the extent you already own those
              rights. You grant the service a limited right to process that content for routing,
              safety, logging, abuse prevention, and request fulfillment.
            </p>
            <p>
              If you configure your own upstream gateway or API credentials, you represent that
              you have authority to use them and authorize us to store and use them to fulfill
              your requests. Stored BYOK credentials may be encrypted at rest, but you remain
              responsible for choosing appropriate upstream providers and plans.
            </p>
            <p>
              Do not send sensitive, regulated, or high-risk data unless you have independently
              confirmed that the deployment, security controls, retention settings, and upstream
              provider terms are appropriate for that data.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>5. Upstream providers and AI-specific disclaimers</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              The service depends on third-party infrastructure and model providers. Requests may
              be routed to providers you configure or that the operator makes available.
            </p>
            <BulletList items={DISCLAIMER_ITEMS} />
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>6. Fees and billing</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              For self-hosted use of the public codebase, no software license fee is charged by
              this repository itself unless you enter into a separate services or hosting
              agreement. Managed hosting, support, migration work, or assisted self-hosting may be
              billed under a separate order form, statement of work, or subscription agreement.
            </p>
            <p>
              If you do not charge users yet, replace this section with a simple statement such
              as: &quot;The service is currently provided without paid subscriptions.&quot;
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>7. Termination</h2>
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
            <h2>8. Warranty and liability</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the
              maximum extent allowed by law, we disclaim warranties and are not liable for
              indirect, incidental, special, consequential, exemplary, or lost-profit damages.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>9. Contact and governing terms</h2>
          </div>
          <div className="card-body legal-copy">
            <p>
              Questions about these Terms should be sent to <strong>[CONTACT EMAIL]</strong>. Add
              your governing law, venue, and effective date here before launch.
            </p>
          </div>
        </article>
      </section>

      <section className="alert alert--warning quickstart-note">
        <div>
          <strong>Before you publish this</strong>
          <p>
            This version is now product-specific, but it still needs your entity name, contact
            method, fees, refund policy if any, governing law, and support commitments.
          </p>
        </div>
      </section>
    </div>
  );
}
