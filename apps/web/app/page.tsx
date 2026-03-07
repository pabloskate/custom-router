"use client";

import { useEffect } from "react";
import "./landing.css";

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".fade-in").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing">

      {/* ─── Nav ─────────────────────────────────────────────────────── */}
      <nav className="l-nav">
        <div className="l-nav-brand">
          <div className="l-nav-mark">CR</div>
          <span className="l-nav-name">CustomRouter</span>
        </div>
        <div className="l-nav-links">
          <a href="#problem">Problem</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Why It Wins</a>
          <a href="/admin">Dashboard</a>
          <a href="/admin" className="l-nav-cta">Build Your Auto Mode</a>
        </div>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <section className="l-hero">
        <div className="l-hero-grid" />

        <div className="l-hero-content">
          <div className="l-hero-badge">Open-Source LLM Router</div>

          <h1>
            Auto-routing you can<br />
            <em className="l-hero-em">actually control.</em>
          </h1>

          <p className="l-hero-sub">
            Bring your own models, define your own routing logic, and inspect every
            decision. CustomRouter gives you the convenience of auto mode without
            handing model selection to a black box.
          </p>

          <div className="l-hero-actions">
            <a href="/admin" className="l-btn-primary">
              Build Your Own Auto Mode <ArrowRight />
            </a>
            <a href="#how-it-works" className="l-btn-secondary">
              See How It Works
            </a>
          </div>

          <div className="l-routing-visual fade-in">
            <div className="l-rv-pane">
              <div className="l-rv-label">// Incoming request</div>
              <div className="l-rv-content">
                &ldquo;Route coding tasks to stronger models. Keep cheap models for simple chat.&rdquo;
              </div>
            </div>
            <div className="l-rv-arrow">
              <ArrowRight />
            </div>
            <div className="l-rv-result">
              <div className="l-rv-label">// Selected by your router</div>
              <div className="l-rv-badge">your rules</div>
              <div className="l-rv-model">claude-3-5-sonnet</div>
              <div className="l-rv-reason">matched: code task → strong model profile</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust bar ───────────────────────────────────────────────── */}
      <div className="l-trust-bar">
        <div className="l-trust-item"><span className="l-trust-dot" /> Open source</div>
        <div className="l-trust-item"><span className="l-trust-dot" /> Self-hostable</div>
        <div className="l-trust-item"><span className="l-trust-dot" /> OpenAI SDK compatible</div>
        <div className="l-trust-item"><span className="l-trust-dot" /> Bring your own gateways</div>
        <div className="l-trust-item"><span className="l-trust-dot" /> Explainable routing</div>
      </div>

      {/* ─── Problem ─────────────────────────────────────────────────── */}
      <section className="l-section" id="problem">
        <div className="fade-in">
          <span className="l-eyebrow">The Problem</span>
          <h2 className="l-section-heading">
            Most auto routers are convenient.<br />Very few are trustworthy.
          </h2>
          <p className="l-section-sub">
            Plenty of products offer auto model selection, but the routing logic is
            hidden. You do not know what it is optimizing for, why a model was chosen,
            or whether the tradeoff serves your product or the platform selling it.
          </p>
        </div>

        <div className="l-problem-grid fade-in">
          <div className="l-problem-card">
            <div className="l-problem-glyph l-glyph-red">×</div>
            <h3>Black-box logic</h3>
            <p>You get auto mode, but no visibility into how decisions are made or whose incentives shape them.</p>
          </div>
          <div className="l-problem-card">
            <div className="l-problem-glyph l-glyph-amber">⚠</div>
            <h3>No custom models or conditions</h3>
            <p>Most routers lock you into a fixed set of providers, models, and hidden heuristics. You cannot tune them to your product.</p>
          </div>
          <div className="l-problem-card">
            <div className="l-problem-glyph l-glyph-orange">↑</div>
            <h3>Hard to trust in production</h3>
            <p>If quality drops, costs rise, or a provider fails, you have no clear way to inspect or correct the behavior.</p>
          </div>
        </div>
      </section>

      {/* ─── How it works ────────────────────────────────────────────── */}
      <div className="l-section-full" id="how-it-works">
        <div className="l-section-inner">
          <div className="fade-in">
            <span className="l-eyebrow center">How It Works</span>
            <h2 className="l-section-heading center">Build your own auto mode.</h2>
            <p className="l-section-sub center">
              CustomRouter gives you one OpenAI-compatible endpoint, but the routing
              behavior is yours. Add your own gateways, define your own conditions, and
              tune for quality, speed, cost, reliability, or control.
            </p>
          </div>

          <div className="l-steps fade-in">
            <div className="l-step">
              <div className="l-step-num">STEP 01</div>
              <h3>Connect your model gateways</h3>
              <p>Add OpenAI, Anthropic, OpenRouter, or any compatible upstream. Build the exact model catalog you want the router to use.</p>
              <div className="l-pills">
                <span className="l-pill">OpenAI</span>
                <span className="l-pill">Anthropic</span>
                <span className="l-pill">OpenRouter</span>
                <span className="l-pill">Compatible APIs</span>
              </div>
            </div>

            <div className="l-step">
              <div className="l-step-num">STEP 02</div>
              <h3>Define routing in plain English</h3>
              <p>Tell the router how to think: use stronger models for code, cheaper ones for simple tasks, vision models for image inputs.</p>
              <div className="l-step-quote">
                &ldquo;Use stronger models for coding. Use cheap fast models for support. Route image requests to vision-capable models only.&rdquo;
              </div>
            </div>

            <div className="l-step">
              <div className="l-step-num">STEP 03</div>
              <h3>Keep coding against model: &ldquo;auto&rdquo;</h3>
              <p>Your app keeps one integration. The router selects models, keeps threads coherent, and falls back when something breaks.</p>
              <div className="l-step-code">
                <span className="l-kw">await</span> openai.chat.completions<br />
                &nbsp;&nbsp;.create({"{"}<br />
                &nbsp;&nbsp;&nbsp;&nbsp;model: <span className="l-str">&quot;auto&quot;</span>,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;messages<br />
                &nbsp;&nbsp;{"}"})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Features ────────────────────────────────────────────────── */}
      <section className="l-section" id="features">
        <div className="fade-in">
          <span className="l-eyebrow center">Why Teams Use It</span>
          <h2 className="l-section-heading center">
            Control the upside of auto-routing<br />without the black box.
          </h2>
          <p className="l-section-sub center">
            The point is not just to automate model choice. The point is to automate it on your terms.
          </p>
        </div>

        <div className="l-features-grid fade-in">
          <div className="l-feature">
            <div className="l-feature-tag l-tag-cyan" />
            <h3>Bring Your Own Models</h3>
            <p>Use the providers and model IDs you actually want, not just the list a platform exposes.</p>
          </div>
          <div className="l-feature">
            <div className="l-feature-tag l-tag-indigo" />
            <h3>Custom Routing Logic</h3>
            <p>Define task-specific routing conditions in plain English instead of hardcoding branching logic across your app.</p>
          </div>
          <div className="l-feature">
            <div className="l-feature-tag l-tag-green" />
            <h3>Inspect Every Decision</h3>
            <p>See why a request was routed, what confidence the router had, and what fallback path it used.</p>
          </div>
          <div className="l-feature">
            <div className="l-feature-tag l-tag-amber" />
            <h3>Thread-Aware Routing</h3>
            <p>Keep conversations pinned to the right model so multi-turn behavior stays coherent.</p>
          </div>
          <div className="l-feature">
            <div className="l-feature-tag l-tag-cyan" />
            <h3>Automatic Failover</h3>
            <p>If a provider is slow or failing, the router can move to the next best option automatically.</p>
          </div>
          <div className="l-feature">
            <div className="l-feature-tag l-tag-indigo" />
            <h3>Profiles for Real Workloads</h3>
            <p>Create cost-first, code-first, support-first, or client-specific routing strategies from the same endpoint.</p>
          </div>
        </div>
      </section>

      {/* ─── Compare ─────────────────────────────────────────────────── */}
      <section className="l-section">
        <div className="fade-in">
          <span className="l-eyebrow">Open Source</span>
          <h2 className="l-section-heading">Trust comes from transparency.</h2>
          <p className="l-section-sub">
            CustomRouter is built for teams that want the convenience of auto mode
            without giving up visibility or control. Open source means you can inspect
            the logic, self-host the stack, and adapt the router to your own constraints.
          </p>
        </div>

        <div className="l-compare-wrap fade-in">
          <div className="l-compare-col">
            <div className="l-compare-header before">// Black-box auto</div>
            <div className="l-compare-row"><span className="l-cx">✗</span><span>Hidden routing logic</span></div>
            <div className="l-compare-row"><span className="l-cx">✗</span><span>Unknown incentives</span></div>
            <div className="l-compare-row"><span className="l-cx">✗</span><span>Fixed provider choices</span></div>
            <div className="l-compare-row"><span className="l-cx">✗</span><span>No explainability or custom conditions</span></div>
          </div>
          <div className="l-compare-col">
            <div className="l-compare-header after">// With CustomRouter</div>
            <div className="l-compare-row"><span className="l-ck">✓</span><span>Your models and gateways</span></div>
            <div className="l-compare-row"><span className="l-ck">✓</span><span>Your cost and quality tradeoffs</span></div>
            <div className="l-compare-row"><span className="l-ck">✓</span><span>Plain-English routing rules</span></div>
            <div className="l-compare-row"><span className="l-ck">✓</span><span>Inspectable decisions and fallbacks</span></div>
          </div>
        </div>
      </section>

      {/* ─── Audience ────────────────────────────────────────────────── */}
      <section className="l-section">
        <div className="fade-in">
          <span className="l-eyebrow">Who It&apos;s For</span>
          <h2 className="l-section-heading">
            Built for teams already using<br />more than one model.
          </h2>
          <p className="l-section-sub">
            If you already care about quality, cost, reliability, and control, this gives
            you a way to turn auto-routing into a product advantage instead of a black box.
          </p>
        </div>

        <div className="l-profiles-grid fade-in">
          <div className="l-profile">
            <div className="l-profile-title">AI product teams</div>
            <p>Route different workloads without rewriting app logic every time the model landscape changes.</p>
            <div className="l-profile-tags">
              <span className="l-ptag l-ptag-green">quality + cost</span>
              <span className="l-ptag l-ptag-indigo">one endpoint</span>
            </div>
          </div>

          <div className="l-profile">
            <div className="l-profile-title">Devtool builders</div>
            <p>Offer auto mode to users without hiding how it works or surrendering provider choice.</p>
            <div className="l-profile-tags">
              <span className="l-ptag l-ptag-cyan">inspectable</span>
              <span className="l-ptag l-ptag-indigo">user-aligned</span>
            </div>
          </div>

          <div className="l-profile">
            <div className="l-profile-title">Agencies and consultants</div>
            <p>Create client-specific routing profiles with different reliability, quality, and budget targets.</p>
            <div className="l-profile-tags">
              <span className="l-ptag l-ptag-green">custom profiles</span>
              <span className="l-ptag l-ptag-cyan">portable stack</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA ──────────────────────────────────────────────── */}
      <section className="l-bottom-cta fade-in">
        <h2>Stop guessing what auto is doing.</h2>
        <p>Build an open-source router that works for your product, your users, and your economics.</p>
        <div className="l-bottom-cta-actions">
          <a href="/admin" className="l-btn-primary">
            Build Your Own Auto Mode <ArrowRight />
          </a>
          <a href="#how-it-works" className="l-btn-secondary">
            See How It Works
          </a>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="l-footer">
        <div className="l-footer-left">
          CustomRouter &mdash; open-source auto-routing you can inspect, tune, and trust
        </div>
        <div className="l-footer-right">
          <a href="/admin">Dashboard</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Features</a>
        </div>
      </footer>

    </div>
  );
}
