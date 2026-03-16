#!/usr/bin/env node
/**
 * Verifies admin flow with real UI login.
 *
 * Usage:
 *   BASE_URL=http://localhost:3010 node scripts/verify-admin-flow.mjs
 *
 * Optional:
 *   VERIFY_EMAIL=existing@example.com VERIFY_PASSWORD=secret
 *     -> skip signup and only validate UI login with existing credentials
 */
import { chromium } from "playwright";
import { writeFile } from "fs/promises";

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || "3000"}`;
const VERIFY_EMAIL = process.env.VERIFY_EMAIL || "";
const VERIFY_PASSWORD = process.env.VERIFY_PASSWORD || "";
const TEST_PASSWORD = VERIFY_PASSWORD || "TestPass123!";
const TEST_USER = {
  name: "Verify Admin User",
  email: VERIFY_EMAIL || `verify-admin+${Date.now()}@test.local`,
  password: TEST_PASSWORD,
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const runtimeIssues = [];

  page.on("pageerror", (err) => {
    runtimeIssues.push(`pageerror: ${String(err)}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      runtimeIssues.push(`console:error: ${msg.text()}`);
    }
  });
  page.on("requestfailed", (req) => {
    runtimeIssues.push(`requestfailed: ${req.url()} :: ${req.failure()?.errorText || "unknown"}`);
  });

  try {
    console.log(`Checking registration status on ${BASE}...`);
    const registrationRes = await context.request.get(`${BASE}/api/v1/auth/registration-status`, {
      failOnStatusCode: false,
    });
    const registrationText = await registrationRes.text();
    console.log(`Registration status ${registrationRes.status()}: ${registrationText}`);

    if (!VERIFY_EMAIL) {
      console.log("Creating account via API...");
      const signupRes = await context.request.post(`${BASE}/api/v1/auth/signup`, {
        data: TEST_USER,
        headers: { "Content-Type": "application/json" },
        failOnStatusCode: false,
      });
      const signupText = await signupRes.text();
      if (signupRes.status() !== 201) {
        throw new Error(
          `Signup failed (${signupRes.status()}): ${signupText}\n` +
            `Hint: start local with REGISTRATION_MODE=open or pass VERIFY_EMAIL/VERIFY_PASSWORD.`
        );
      }
      console.log("✓ Account created");
      await context.request.post(`${BASE}/api/v1/auth/logout`, { failOnStatusCode: false });
    } else {
      console.log(`Using existing credentials for ${VERIFY_EMAIL}`);
    }

    console.log("Opening /admin and performing UI login...");
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.locator("#password-input").fill(TEST_USER.password);

    const submit = page.locator("button.btn.btn--primary");
    await submit.waitFor({ state: "visible", timeout: 10000 });
    if (await submit.isDisabled()) {
      throw new Error(
        "Login submit button is disabled after entering credentials. " +
          "This usually means hydration failed (chunk mismatch or CSP blocked dev runtime)."
      );
    }
    await submit.click();
    await page.waitForSelector("text=Routing", { timeout: 10000 });
    console.log("✓ UI login succeeded");

    // Verify authenticated session after UI login.
    const loginRes = await context.request.get(`${BASE}/api/v1/user/me`, {
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
    if (loginRes.status() !== 200) {
      throw new Error(`Session check failed (${loginRes.status()}): ${await loginRes.text()}`);
    }

    // Verify key sections are interactive.
    const routingTab = page.locator("a, button", { hasText: "Routing" }).first();
    if (await routingTab.isVisible()) {
      await routingTab.click();
      await page.waitForTimeout(800);
    }

    // 9. Check routing profiles controls and autosave status.
    await page.getByRole("button", { name: "Quick setup" }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Add profile" }).waitFor({ state: "visible", timeout: 5000 });
    await page.locator("text=All changes saved").first().waitFor({ state: "visible", timeout: 5000 });
    await page.locator("text=Profiles").first().waitFor({ state: "visible", timeout: 5000 });
    console.log("✓ Routing page loads");

    // 10. Click API Keys tab
    const keysTab = page.locator("a, button", { hasText: /API Key|Keys/ }).first();
    if (await keysTab.isVisible()) {
      await keysTab.click();
      await page.waitForTimeout(500);
      console.log("✓ API Keys tab loads");
    }

    if (runtimeIssues.length > 0) {
      console.log("\nRuntime warnings observed:");
      for (const issue of runtimeIssues.slice(0, 10)) console.log(`- ${issue}`);
    }

    console.log(`\n✓ Admin flow verified successfully on ${BASE}`);
  } catch (err) {
    console.error("Failed:", err.message);
    if (runtimeIssues.length > 0) {
      console.error("Runtime issues observed:");
      for (const issue of runtimeIssues.slice(0, 15)) console.error(`- ${issue}`);
    }
    const outDir = "scripts";
    await page.screenshot({ path: `${outDir}/verify-admin-failure.png` });
    const html = await page.content();
    await writeFile(`${outDir}/verify-admin-failure.html`, html);
    console.error(`Screenshot: ${outDir}/verify-admin-failure.png`);
    console.error(`HTML dump: ${outDir}/verify-admin-failure.html`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
