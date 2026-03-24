import Link from "next/link";

import { OSS } from "../../src/lib/constants";

const PUBLIC_REPO_ITEMS = [
  "Router engine, catalog ingest, schema, and Cloudflare deployment path",
  "Admin UI, BYOK credential flows, API keys, and optional routing explanations",
  "Stable OpenAI-compatible endpoints for chat completions, responses, and models",
] as const;

const MANAGED_ITEMS = [
  "Managed BYOK hosting runs tagged public releases from this repository",
  "Billing, provisioning, backups, alerts, and internal support tooling stay private",
  "Assisted self-hosting is a services layer on top of the same public codebase",
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

export default function OpenSourcePage() {
  return (
    <div className="quickstart-page">
      <section className="quickstart-hero">
        <span className="badge badge--info">Open source and legal</span>
        <h1>CustomRouter is shipped as an AGPL-licensed self-hostable product.</h1>
        <p>
          The source code for the router, admin UI, ingest worker, and deployment path is
          public. Hosted service operations stay outside the repo, but they are expected to
          run the same tagged releases that self-hosted users can deploy themselves.
        </p>
        <div className="quickstart-actions">
          <a className="btn" href={OSS.REPO_URL} target="_blank" rel="noreferrer">
            View Source
          </a>
          <a className="btn btn--secondary" href={OSS.LICENSE_URL} target="_blank" rel="noreferrer">
            Read License
          </a>
          <Link className="btn btn--ghost" href="/admin">
            Open Admin
          </Link>
        </div>
      </section>

      <section className="quickstart-boundary-grid">
        <article className="card">
          <div className="card-header">
            <h2>Public repository</h2>
          </div>
          <div className="card-body">
            <BulletList items={PUBLIC_REPO_ITEMS} />
          </div>
        </article>
        <article className="card">
          <div className="card-header">
            <h2>Managed service layer</h2>
          </div>
          <div className="card-body">
            <BulletList items={MANAGED_ITEMS} />
          </div>
        </article>
      </section>

      <section className="quickstart-grid quickstart-grid--two-up">
        <article className="card">
          <div className="card-header">
            <h2>Source and docs</h2>
          </div>
          <div className="card-body quickstart-card-body">
            <p>Use the public repo and docs as the source of truth for self-hosting and upgrades.</p>
            <div className="quickstart-link-list">
              <a href={OSS.README_URL} target="_blank" rel="noreferrer">README</a>
              <a href={OSS.QUICKSTART_URL} target="_blank" rel="noreferrer">Quickstart guide</a>
              <a href={OSS.DEPLOYMENT_URL} target="_blank" rel="noreferrer">Cloudflare deployment</a>
              <a href={OSS.RELEASE_PROCESS_URL} target="_blank" rel="noreferrer">Release process</a>
              <a href={OSS.SCHEMA_URL} target="_blank" rel="noreferrer">D1 schema</a>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>Security reporting</h2>
          </div>
          <div className="card-body quickstart-card-body">
            <p>Do not file public issues for vulnerabilities. Use a private channel first.</p>
            <div className="quickstart-link-list">
              <a href={OSS.SECURITY_ADVISORY_URL} target="_blank" rel="noreferrer">
                Open private GitHub advisory
              </a>
              <a href={OSS.SECURITY_POLICY_URL} target="_blank" rel="noreferrer">
                Read security policy
              </a>
              <a href={OSS.MAINTAINER_PROFILE_URL} target="_blank" rel="noreferrer">
                Contact maintainer profile
              </a>
            </div>
          </div>
        </article>
      </section>

      <section className="alert alert--warning quickstart-note">
        <div>
          <strong>No warranty</strong>
          <p>
            CustomRouter is distributed under the GNU Affero General Public License v3.0 only
            and is provided without warranty. Review the license before deploying it in
            production or offering it as a network service.
          </p>
        </div>
      </section>
    </div>
  );
}
