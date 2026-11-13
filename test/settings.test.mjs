// Pure logic in settings.js: duration formatting and exclusion matching.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { DEFAULTS, formatDuration, formatDurationText, getSettings, isExcluded } from "../settings.js";

describe("formatDuration", () => {
  it("renders whole hours", () => {
    assert.deepEqual(formatDuration(120), { amount: "2", unit: "hours" });
    assert.deepEqual(formatDuration(60), { amount: "1", unit: "hour" });
  });

  it("renders minutes below an hour", () => {
    assert.deepEqual(formatDuration(45), { amount: "45", unit: "minutes" });
    assert.deepEqual(formatDuration(1), { amount: "1", unit: "minute" });
  });

  it("renders sub-minute values in seconds", () => {
    assert.deepEqual(formatDuration(0.06), { amount: "4", unit: "seconds" });
    assert.deepEqual(formatDuration(1 / 60), { amount: "1", unit: "second" });
  });

  it("keeps fractional hours to two decimals", () => {
    assert.deepEqual(formatDuration(90), { amount: "1.5", unit: "hours" });
  });

  it("falls back to zero minutes for unusable input", () => {
    for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined, "abc"]) {
      assert.deepEqual(formatDuration(value), { amount: "0", unit: "minutes" });
    }
  });
});

describe("formatDurationText", () => {
  it("joins amount and unit", () => {
    assert.equal(formatDurationText(120), "2 hours");
    assert.equal(formatDurationText(45), "45 minutes");
  });
});

describe("isExcluded", () => {
  const domains = ["example.com", "mail.google.com"];

  it("matches an exact host", () => {
    assert.equal(isExcluded("https://example.com/a", domains), true);
  });

  it("matches subdomains of an excluded domain", () => {
    assert.equal(isExcluded("https://app.example.com/x?y=1", domains), true);
  });

  it("does not match a host that merely ends with the name", () => {
    assert.equal(isExcluded("https://notexample.com/", domains), false);
  });

  it("does not match unrelated hosts", () => {
    assert.equal(isExcluded("https://news.ycombinator.com/", domains), false);
  });

  it("matches case-insensitively", () => {
    assert.equal(isExcluded("https://EXAMPLE.com/", ["example.com"]), true);
  });

  it("returns false for no list, empty list, and unparseable URLs", () => {
    assert.equal(isExcluded("https://example.com/", []), false);
    assert.equal(isExcluded("https://example.com/", undefined), false);
    assert.equal(isExcluded("not a url", domains), false);
    assert.equal(isExcluded("", domains), false);
  });
});

describe("getSettings", () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  const withStorage = (settings) => {
    globalThis.chrome = { storage: { sync: { get: async () => ({ settings }) } } };
  };

  it("returns the defaults when nothing is stored", async () => {
    globalThis.chrome = { storage: { sync: { get: async () => ({}) } } };
    assert.deepEqual(await getSettings(), DEFAULTS);
  });

  it("keeps stored values", async () => {
    withStorage({ idleMinutes: 30, excludedDomains: ["a.com"], theme: "dark" });
    assert.deepEqual(await getSettings(), { idleMinutes: 30, excludedDomains: ["a.com"], theme: "dark" });
  });

  it("converts the legacy hours setting", async () => {
    withStorage({ idleHours: 1.5 });
    assert.equal((await getSettings()).idleMinutes, 90);
  });

  it("ignores unusable values instead of storing them", async () => {
    withStorage({ idleMinutes: 0, excludedDomains: "a.com", theme: "neon" });
    assert.deepEqual(await getSettings(), DEFAULTS);
  });

  it("drops empty and non-string domains", async () => {
    withStorage({ excludedDomains: ["a.com", "", 42, null, "b.com"] });
    assert.deepEqual((await getSettings()).excludedDomains, ["a.com", "b.com"]);
  });
});
