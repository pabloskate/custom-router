import type { Route } from "next";
import Link from "next/link";

import { OSS } from "../../lib/constants";

type QuickstartLink =
  | { label: string; href: string; external: true }
  | { label: string; href: Route; external: false };

const QUICKSTART_CARDS = [
  {
    title: "1. Local setup",
    summary: "Install dependencies, copy the example environment file, and run the web app locally.",
    code: "npm install\nnpm run typecheck\nnpm run dev -w @auto-router/web",
    links: [
      { label: "README", href: OSS.README_URL, external: true },
      { label: "Quickstart doc", href: OSS.QUICKSTART_URL, external: true },
    ],
  },
  {
    title: "2. Deploy to Cloudflare",
    summary: "Provision D1 and KV, apply the schema, then deploy the web app and ingest worker.",
    code: "infra/d1/schema.sql\ndocs/deployment-cloudflare.md",
    links: [
      { label: "D1 schema", href: OSS.SCHEMA_URL, external: true },
      { label: "Deployment guide", href: OSS.DEPLOYMENT_URL, external: true },
    ],
  },
  {
    title: "3. Route traffic",
    summary: "Open the dashboard, add a gateway, create an API key, and point any OpenAI SDK at /api/v1.",
    code: "POST /api/v1/chat/completions\nmodel: \"auto\"",
    links: [
      { label: "Open dashboard", href: "/admin", external: false },
      { label: "Open-source info", href: "/open-source", external: false },
    ],
  },
] as const;

const PUBLIC_REPO_ITEMS = [
  "Router engine, catalog ingest, and Cloudflare deployment path",
  "Self-hostable admin UI, BYOK flows, API keys, and routing explanations",
  "OpenAI-compatible endpoints for chat completions, responses, and models",
] as const;

const PRIVATE_BOUNDARY_ITEMS = [
  "Landing site, pricing, billing, and hosted provisioning",
  "Managed service operations such as backups, alerts, and internal runbooks",
  "Support tooling and future commercial entitlements",
] as const;

const API_ENDPOINTS = [
  "POST /api/v1/chat/completions",
  "POST /api/v1/responses",
  "GET /api/v1/models",
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

function QuickstartLinks({ links }: { links: readonly QuickstartLink[] }) {
  return (
    <div className="quickstart-link-list">
      {links.map((link) =>
        link.external ? (
          <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ) : (
          <Link key={link.label} href={link.href}>
            {link.label}
          </Link>
        ),
      )}
    </div>
  );
}

export function OssHomepage() {
  return (
    <div className="quickstart-page">
      <section className="quickstart-hero">
        <span className="badge badge--info">Self-hostable OpenAI-compatible router</span>
        <h1>Run CustomRouter on your own infrastructure.</h1>
        <p>
          This public repo contains the full self-hostable product: the router, admin UI,
          BYOK flows, ingest worker, schema, and Cloudflare deployment path. Commercial
          hosting, billing, and operations stay outside the repo by design.
        </p>
        <div className="quickstart-actions">
          <Link className="btn" href="/admin">Open Dashboard</Link>
          <a className="btn btn--secondary" href="#quickstart">View Quickstart</a>
          <Link className="btn btn--ghost" href="/open-source">Source and License</Link>
        </div>
      </section>

      <section className="alert alert--info quickstart-note">
        <div>
          <strong>Prefer not to self-host?</strong>
          <p>
            A managed hosted version is available with automatic updates, no infrastructure setup,
            and a free tier to get started.{" "}
            <a href="https://autorouter.ai/pricing" target="_blank" rel="noreferrer">View plans →</a>
          </p>
        </div>
      </section>

      <section id="quickstart" className="quickstart-grid">
        {QUICKSTART_CARDS.map((card) => (
          <article key={card.title} className="card">
            <div className="card-header">
              <h2>{card.title}</h2>
            </div>
            <div className="card-body quickstart-card-body">
              <p>{card.summary}</p>
              <pre className="code-block quickstart-code-block">
                <code>{card.code}</code>
              </pre>
              <QuickstartLinks links={card.links} />
            </div>
          </article>
        ))}
      </section>

      <section className="alert alert--info quickstart-note">
        <div>
          <strong>Open-core boundary</strong>
          <p>
            Hosted BYOK service, pricing, and internal operations are intentionally not part of
            this repo. Self-hosted and hosted customers use the same public API contract.
          </p>
        </div>
      </section>

      <section className="quickstart-boundary-grid">
        <article className="card">
          <div className="card-header">
            <h2>Included here</h2>
          </div>
          <div className="card-body">
            <BulletList items={PUBLIC_REPO_ITEMS} />
          </div>
        </article>
        <article className="card">
          <div className="card-header">
            <h2>Kept private</h2>
          </div>
          <div className="card-body">
            <BulletList items={PRIVATE_BOUNDARY_ITEMS} />
          </div>
        </article>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Stable public API</h2>
        </div>
        <div className="card-body quickstart-api">
          <p>
            No hosted-only API behavior is introduced here. The self-hostable app and the managed
            BYOK service share the same external interface.
          </p>
          <div className="quickstart-endpoint-row">
            {API_ENDPOINTS.map((endpoint) => (
              <code key={endpoint} className="code">{endpoint}</code>
            ))}
          </div>
          <p className="quickstart-muted">
            Additional setup and release guidance lives in{" "}
            <a href={OSS.README_URL} target="_blank" rel="noreferrer">README</a>,{" "}
            <a href={OSS.QUICKSTART_URL} target="_blank" rel="noreferrer">quickstart</a>,{" "}
            and{" "}
            <a href={OSS.RELEASE_PROCESS_URL} target="_blank" rel="noreferrer">release process</a>.
          </p>
        </div>
      </section>
    </div>
  );
}
