// Pure logic in settings.js: duration formatting and exclusion matching.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { DEFAULTS, formatDurationText, getSettings, isExcluded } from "../settings.js";

// Intl may separate the number and the unit with a non-breaking or narrow
// no-break space depending on the locale.
const plain = (text) => text.replace(/[\u00a0\u202f\u2009]/g, " ");

const duration = (minutes, locale) => plain(formatDurationText(minutes, locale));

describe("formatDurationText", () => {
  it("renders whole hours", () => {
    assert.equal(duration(120, "en"), "2 hours");
    assert.equal(duration(60, "en"), "1 hour");
  });

  it("renders minutes below an hour", () => {
    assert.equal(duration(45, "en"), "45 minutes");
    assert.equal(duration(1, "en"), "1 minute");
  });

  it("renders sub-minute values in seconds", () => {
    assert.equal(duration(0.06, "en"), "4 seconds");
    assert.equal(duration(1 / 60, "en"), "1 second");
  });

  it("keeps fractional hours", () => {
    assert.equal(duration(90, "en"), "1.5 hours");
  });

  it("falls back to zero minutes for unusable input", () => {
    for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined, "abc"]) {
      assert.equal(duration(value, "en"), "0 minutes");
    }
  });

  it("localizes the unit and the plural", () => {
    assert.equal(duration(120, "pt-BR"), "2 horas");
    assert.equal(duration(1, "pt-BR"), "1 minuto");
    assert.equal(duration(0.06, "pt-BR"), "4 segundos");
    // CLDR's Portuguese plural rule treats 1.5 as singular ("i = 0..1"), so the
    // platform says "1,5 hora". Whole hours, the common case, read normally.
    assert.equal(duration(90, "pt-BR"), "1,5 hora");

    assert.equal(duration(120, "es"), "2 horas");
    assert.equal(duration(1, "es"), "1 minuto");

    assert.equal(duration(120, "fr"), "2 heures");
    assert.equal(duration(45, "fr"), "45 minutes");
    assert.equal(duration(0.06, "fr"), "4 secondes");
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
