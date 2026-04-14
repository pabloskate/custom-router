import { describe, expect, it } from "vitest";

import {
  resolveUpstreamHostPolicy,
  validateUpstreamBaseUrl,
} from "./upstream";

describe("upstream host policy", () => {
  it("allows built-in preset hosts by default", () => {
    const policy = resolveUpstreamHostPolicy({});
    const result = validateUpstreamBaseUrl("https://api.openai.com/v1", policy);

    expect(result).toEqual({
      ok: true,
      normalized: "https://api.openai.com/v1",
      hostname: "api.openai.com",
    });
  });

  it("blocks arbitrary custom hosts by default", () => {
    const policy = resolveUpstreamHostPolicy({});
    const result = validateUpstreamBaseUrl("https://gateway.example/v1", policy);

    expect(result).toEqual({
      ok: false,
      code: "host_not_allowed",
      hostname: "gateway.example",
    });
  });

  it("allows custom hosts from the explicit allowlist", () => {
    const policy = resolveUpstreamHostPolicy({
      UPSTREAM_ALLOWED_HOSTS: "gateway.example, https://classifier.example/v1",
    });

    expect(validateUpstreamBaseUrl("https://gateway.example/v1", policy)).toEqual({
      ok: true,
      normalized: "https://gateway.example/v1",
      hostname: "gateway.example",
    });
    expect(validateUpstreamBaseUrl("https://classifier.example/v1", policy)).toEqual({
      ok: true,
      normalized: "https://classifier.example/v1",
      hostname: "classifier.example",
    });
  });

  it("allows arbitrary hosts only when explicitly enabled", () => {
    const policy = resolveUpstreamHostPolicy({
      UPSTREAM_ALLOW_ARBITRARY_HOSTS: "true",
    });
    const result = validateUpstreamBaseUrl("https://gateway.example/v1", policy);

    expect(result).toEqual({
      ok: true,
      normalized: "https://gateway.example/v1",
      hostname: "gateway.example",
    });
  });
});
