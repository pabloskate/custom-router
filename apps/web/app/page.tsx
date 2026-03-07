import "./landing.css";

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function CloudflareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M16.5 17.5H6.3a.4.4 0 01-.4-.3.4.4 0 01.2-.4l8.6-5.4a1.8 1.8 0 00.7-2.2 1.8 1.8 0 00-1.7-1.2H5.4a.2.2 0 01-.2-.2v-.6c0-.1.1-.2.2-.2h10.1a3.8 3.8 0 013.6 2.5 3.8 3.8 0 01-1.5 4.4l-1 .6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19.5 14.5a2.5 2.5 0 00-2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="landing">
      {/* ─── Nav ─────────────────────────────────────────────────────── */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <div className="landing-nav-mark">CR</div>
          <span className="landing-nav-name">CustomRouter</span>
        </div>
        <div className="landing-nav-links">
          <a href="#problem">Problem</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Why It Wins</a>
          <a href="/admin">Dashboard</a>
          <a href="/admin" className="nav-cta">Build Your Auto Mode</a>
        </div>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">Open-Source LLM Router</div>

        <h1>
          Auto-routing you can<br />
          <span className="gradient-text">actually control.</span>
        </h1>

        <p className="hero-sub">
          Bring your own models, define your own routing logic, and inspect every decision.
          CustomRouter gives you the convenience of auto mode without handing model selection
          to a black box.
        </p>

        <div className="hero-actions">
          <a href="/admin" className="hero-btn-primary">
            Build Your Own Auto Mode <ArrowRight />
          </a>
          <a href="#how-it-works" className="hero-btn-secondary">
            See How It Works
          </a>
        </div>

        <div className="hero-visual">
          <div className="hero-card">
            <div className="hero-card-header">
              <span className="hero-card-label">Incoming request</span>
            </div>
            <div className="hero-card-body">
              "Route this coding task to a stronger model and keep cheap models for simple chat."
            </div>
          </div>
          <div className="hero-arrow">
            <ArrowRight />
          </div>
          <div className="hero-card highlight">
            <div className="hero-card-header">
              <span className="hero-card-label">Selected by your router</span>
              <span className="hero-card-badge">your rules</span>
            </div>
            <div className="hero-card-body small">
              Chosen using your logic, not hidden vendor incentives.
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust Bar ───────────────────────────────────────────────── */}
      <div className="trust-bar">
        <div className="trust-item">
          <GitHubIcon />
          Open source
        </div>
        <div className="trust-item">
          <ShieldIcon />
          Self-hostable
        </div>
        <div className="trust-item">
          <TerminalIcon />
          OpenAI SDK compatible
        </div>
        <div className="trust-item">
          <CloudflareIcon />
          Bring your own gateways
        </div>
        <div className="trust-item">
          <ShieldIcon />
          Explainable routing
        </div>
      </div>

      {/* ─── The Problem ─────────────────────────────────────────────── */}
      <section className="landing-section" id="problem">
        <div className="section-label">The Problem</div>
        <h2 className="section-heading">Most auto routers are convenient. Very few are trustworthy.</h2>
        <p className="section-desc">
          Plenty of products offer auto model selection, but the routing logic is hidden. You
          do not know what it is optimizing for, why a model was chosen, or whether the tradeoff
          serves your product or the platform selling it.
        </p>

        <div className="problem-grid">
          <div className="problem-card">
            <div className="problem-icon red">&#x2715;</div>
            <h3>Black-box logic</h3>
            <p>
              You get auto mode, but no visibility into how decisions are made or whose incentives
              shape them.
            </p>
          </div>
          <div className="problem-card">
            <div className="problem-icon amber">&#x26A0;</div>
            <h3>No custom models or conditions</h3>
            <p>
              Most routers lock you into a fixed set of providers, models, and hidden heuristics.
              You cannot tune them to your product.
            </p>
          </div>
          <div className="problem-card">
            <div className="problem-icon orange">&#x2191;</div>
            <h3>Hard to trust in production</h3>
            <p>
              If quality drops, costs rise, or a provider fails, you have no clear way to inspect
              or correct the behavior.
            </p>
          </div>
        </div>
      </section>

      {/* ─── How It Works ────────────────────────────────────────────── */}
      <section className="landing-section" id="how-it-works">
        <div className="section-label">How It Works</div>
        <h2 className="section-heading">Build your own auto mode.</h2>
        <p className="section-desc">
          CustomRouter gives you one OpenAI-compatible endpoint, but the routing behavior is
          yours. Add your own gateways, define your own conditions, and tune for quality, speed,
          cost, reliability, or control.
        </p>

        <div className="flow-container">
          <div className="flow-step">
            <div className="flow-marker">
              <div className="flow-number">01</div>
              <div className="flow-line" />
            </div>
            <div className="flow-content">
              <h3>Connect your model gateways</h3>
              <p>
                Add OpenAI, Anthropic, OpenRouter, or any compatible upstream. Build the exact
                model catalog you want the router to use.
              </p>
              <div className="flow-pills">
                <span className="flow-pill">OpenAI</span>
                <span className="flow-pill">Anthropic</span>
                <span className="flow-pill">OpenRouter</span>
                <span className="flow-pill">Compatible APIs</span>
              </div>
            </div>
          </div>

          <div className="flow-step">
            <div className="flow-marker">
              <div className="flow-number">02</div>
              <div className="flow-line" />
            </div>
            <div className="flow-content">
              <h3>Define routing in plain English</h3>
              <p>
                Tell the router how to think: use stronger models for code, cheaper ones for
                simple tasks, vision models for image inputs, or custom profiles for different
                workflows.
              </p>
              <div className="flow-quote">
                &ldquo;Use stronger models for coding. Use cheap fast models for support. Route image
                requests to vision-capable models only.&rdquo;
              </div>
            </div>
          </div>

          <div className="flow-step">
            <div className="flow-marker">
              <div className="flow-number">03</div>
              <div className="flow-line" />
            </div>
            <div className="flow-content">
              <h3>Keep coding against model: &quot;auto&quot;</h3>
              <p>
                Your app keeps one integration. The router selects models, keeps threads coherent,
                and falls back when something breaks.
              </p>
              <div className="flow-code simple">
                <span style={{ color: "var(--indigo)" }}>await</span> openai.chat.completions.create({"{"}{"\n"}
                {"  "}model: <span style={{ color: "var(--green)" }}>&quot;auto&quot;</span>,{"\n"}
                {"  "}messages{"\n"}
                {"}"})
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────── */}
      <section className="landing-section" id="features">
        <div className="section-label centered">Why Teams Use It</div>
        <h2 className="section-heading centered">Control the upside of auto-routing without the black box.</h2>
        <p className="section-desc centered">
          The point is not just to automate model choice. The point is to automate it on your
          terms.
        </p>

        <div className="features-grid">
          <div className="feature-cell">
            <div className="feature-icon-row">
              <div className="feature-dot cyan" />
              <h3>Bring Your Own Models</h3>
            </div>
            <p>
              Use the providers and model IDs you actually want, not just the list a platform
              exposes.
            </p>
          </div>

          <div className="feature-cell">
            <div className="feature-icon-row">
              <div className="feature-dot indigo" />
              <h3>Custom Routing Logic</h3>
            </div>
            <p>
              Define task-specific routing conditions in plain English instead of hardcoding
              branching logic across your app.
            </p>
          </div>

          <div className="feature-cell">
            <div className="feature-icon-row">
              <div className="feature-dot green" />
              <h3>Inspect Every Decision</h3>
            </div>
            <p>
              See why a request was routed, what confidence the router had, and what fallback path
              it used.
            </p>
          </div>

          <div className="feature-cell">
            <div className="feature-icon-row">
              <div className="feature-dot amber" />
              <h3>Thread-Aware Routing</h3>
            </div>
            <p>
              Keep conversations pinned to the right model so multi-turn behavior stays coherent.
            </p>
          </div>

          <div className="feature-cell">
            <div className="feature-icon-row">
              <div className="feature-dot cyan" />
              <h3>Automatic Failover</h3>
            </div>
            <p>
              If a provider is slow or failing, the router can move to the next best option
              automatically.
            </p>
          </div>

          <div className="feature-cell">
            <div className="feature-icon-row">
              <div className="feature-dot indigo" />
              <h3>Profiles for Real Workloads</h3>
            </div>
            <p>
              Create cost-first, code-first, support-first, or client-specific routing strategies
              from the same endpoint.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Comparison ──────────────────────────────────────────────── */}
      <section className="landing-section">
        <div className="section-label">Open Source</div>
        <h2 className="section-heading">Trust comes from transparency.</h2>
        <p className="section-desc">
          CustomRouter is built for teams that want the convenience of auto mode without giving up
          visibility or control. Open source means you can inspect the logic, self-host the stack,
          and adapt the router to your own constraints.
        </p>

        <div className="compare">
          <div className="compare-pane">
            <div className="compare-header before">Black-box auto</div>
            <div className="compare-body plain">
              <div className="compare-item">
                <span className="compare-x">&#x2718;</span>
                <span>Hidden routing logic</span>
              </div>
              <div className="compare-item">
                <span className="compare-x">&#x2718;</span>
                <span>Unknown incentives</span>
              </div>
              <div className="compare-item">
                <span className="compare-x">&#x2718;</span>
                <span>Fixed provider choices</span>
              </div>
              <div className="compare-item">
                <span className="compare-x">&#x2718;</span>
                <span>No explainability or custom conditions</span>
              </div>
            </div>
          </div>

          <div className="compare-pane">
            <div className="compare-header after">With CustomRouter</div>
            <div className="compare-body plain">
              <div className="compare-item">
                <span className="compare-check">&#x2714;</span>
                <span>Your models and gateways</span>
              </div>
              <div className="compare-item">
                <span className="compare-check">&#x2714;</span>
                <span>Your cost and quality tradeoffs</span>
              </div>
              <div className="compare-item">
                <span className="compare-check">&#x2714;</span>
                <span>Plain-English routing rules</span>
              </div>
              <div className="compare-item">
                <span className="compare-check">&#x2714;</span>
                <span>Inspectable decisions and fallbacks</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Audience ────────────────────────────────────────────────── */}
      <section className="landing-section">
        <div className="section-label">Who It&apos;s For</div>
        <h2 className="section-heading">Built for teams already using more than one model.</h2>
        <p className="section-desc">
          If you already care about quality, cost, reliability, and control, this gives you a way
          to turn auto-routing into a product advantage instead of a black box.
        </p>

        <div className="profiles-row">
          <div className="profile-preview">
            <div className="profile-preview-id">AI product teams</div>
            <p className="profile-preview-desc">
              Route different workloads without rewriting app logic every time the model landscape
              changes.
            </p>
            <span className="profile-tag cyan">quality + cost</span>
            <span className="profile-tag indigo">one endpoint</span>
          </div>

          <div className="profile-preview">
            <div className="profile-preview-id">Devtool builders</div>
            <p className="profile-preview-desc">
              Offer auto mode to users without hiding how it works or surrendering provider choice.
            </p>
            <span className="profile-tag cyan">inspectable</span>
            <span className="profile-tag indigo">user-aligned</span>
          </div>

          <div className="profile-preview">
            <div className="profile-preview-id">Agencies and consultants</div>
            <p className="profile-preview-desc">
              Create client-specific routing profiles with different reliability, quality, and
              budget targets.
            </p>
            <span className="profile-tag cyan">custom profiles</span>
            <span className="profile-tag indigo">portable stack</span>
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA ──────────────────────────────────────────────── */}
      <section className="bottom-cta">
        <h2>Stop guessing what auto is doing.</h2>
        <p>
          Build an open-source router that works for your product, your users, and your economics.
        </p>
        <div className="bottom-cta-actions">
          <a href="/admin" className="hero-btn-primary">
            Build Your Own Auto Mode <ArrowRight />
          </a>
          <a href="#how-it-works" className="hero-btn-secondary">
            See How It Works
          </a>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-left">
          CustomRouter &mdash; open-source auto-routing you can inspect, tune, and trust
        </div>
        <div className="landing-footer-right">
          <a href="/admin">Dashboard</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Features</a>
        </div>
      </footer>
    </div>
  );
}
