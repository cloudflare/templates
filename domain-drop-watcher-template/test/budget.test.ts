import { describe, it, expect } from "vitest";
import { computeBudget, pickLeastLoadedOffset } from "../src/budget.js";

describe("computeBudget", () => {
  it("single 5-min cadence domain → peakDuePerMinute=1, checksPerDay=288", () => {
    const report = computeBudget({
      domains: [{ cadenceMinutes: 5, phaseOffsetMinutes: 0, paused: false, tldSupported: true }],
    });
    expect(report.peakDuePerMinute).toBe(1);
    expect(report.checksPerDay).toBe(288);
    expect(report.withinFreeTier).toBe(true);
  });

  it("45 domains at 5-min with offsets 0..4 (9 per bucket) → peak=9, withinFreeTier=true", () => {
    const domains = [];
    for (let i = 0; i < 45; i++) {
      domains.push({
        cadenceMinutes: 5,
        phaseOffsetMinutes: i % 5,
        paused: false,
        tldSupported: true,
      });
    }
    const report = computeBudget({ domains });
    expect(report.peakDuePerMinute).toBe(9);
    expect(report.withinFreeTier).toBe(true);
  });

  it("46 domains at 1-min cadence → peak=46, withinFreeTier=false", () => {
    const domains = Array.from({ length: 46 }, () => ({
      cadenceMinutes: 1,
      phaseOffsetMinutes: 0,
      paused: false,
      tldSupported: true,
    }));
    const report = computeBudget({ domains });
    expect(report.peakDuePerMinute).toBe(46);
    expect(report.withinFreeTier).toBe(false);
  });

  it("paused and unsupported domains are excluded", () => {
    const report = computeBudget({
      domains: [
        { cadenceMinutes: 5, phaseOffsetMinutes: 0, paused: true, tldSupported: true },
        { cadenceMinutes: 5, phaseOffsetMinutes: 0, paused: false, tldSupported: false },
        { cadenceMinutes: 5, phaseOffsetMinutes: 1, paused: false, tldSupported: true },
      ],
    });
    expect(report.peakDuePerMinute).toBe(1);
    expect(report.checksPerDay).toBe(288);
  });

  it("empty active domains → peak=0, withinFreeTier=true", () => {
    const report = computeBudget({ domains: [] });
    expect(report.peakDuePerMinute).toBe(0);
    expect(report.withinFreeTier).toBe(true);
    expect(report.headroom).toBe(45);
  });

  it("mixed cadences 5,15,60 — LCM=60, verifies peak at overlap minutes", () => {
    const domains = [
      { cadenceMinutes: 5, phaseOffsetMinutes: 0, paused: false, tldSupported: true },
      { cadenceMinutes: 15, phaseOffsetMinutes: 0, paused: false, tldSupported: true },
      { cadenceMinutes: 60, phaseOffsetMinutes: 0, paused: false, tldSupported: true },
    ];
    const report = computeBudget({ domains });
    expect(report.peakDuePerMinute).toBe(3);
    expect(report.peakBucketMinute).toBe(0);
    expect(report.checksPerDay).toBe(288 + 96 + 24);
  });

  it("headroom = subreqLimitPerMinute - peakDuePerMinute", () => {
    const report = computeBudget({
      domains: [{ cadenceMinutes: 1, phaseOffsetMinutes: 0, paused: false, tldSupported: true }],
      subreqLimitPerMinute: 45,
    });
    expect(report.headroom).toBe(44);
  });

  it("d1WritesPerDay = checksPerDay + floor(checksPerDay * 0.05)", () => {
    const report = computeBudget({
      domains: [{ cadenceMinutes: 5, phaseOffsetMinutes: 0, paused: false, tldSupported: true }],
    });
    expect(report.d1WritesPerDay).toBe(288 + Math.floor(288 * 0.05));
  });

  it("warns when peak > 40", () => {
    const domains = Array.from({ length: 41 }, (_, i) => ({
      cadenceMinutes: 1,
      phaseOffsetMinutes: 0,
      paused: false,
      tldSupported: true,
    }));
    const report = computeBudget({ domains });
    expect(report.warnings.some((w) => w.includes("approaching"))).toBe(true);
  });
});

describe("pickLeastLoadedOffset", () => {
  it("given offsets [0,0,1] for cadence=5, proposedCadence=5 → avoids the most-loaded bucket (0)", () => {
    const existing = [
      { cadenceMinutes: 5, phaseOffsetMinutes: 0 },
      { cadenceMinutes: 5, phaseOffsetMinutes: 0 },
      { cadenceMinutes: 5, phaseOffsetMinutes: 1 },
    ];
    const offset = pickLeastLoadedOffset(existing, 5);
    expect(offset).toBeGreaterThanOrEqual(1);
    expect(offset).toBeLessThanOrEqual(4);
    const reportChosen = computeBudget({
      domains: [
        ...existing.map((d) => ({ ...d, paused: false, tldSupported: true })),
        { cadenceMinutes: 5, phaseOffsetMinutes: offset, paused: false, tldSupported: true },
      ],
    });
    const reportWorst = computeBudget({
      domains: [
        ...existing.map((d) => ({ ...d, paused: false, tldSupported: true })),
        { cadenceMinutes: 5, phaseOffsetMinutes: 0, paused: false, tldSupported: true },
      ],
    });
    expect(reportChosen.peakDuePerMinute).toBeLessThanOrEqual(reportWorst.peakDuePerMinute);
  });

  it("with no existing domains, returns 0 (lowest offset)", () => {
    const offset = pickLeastLoadedOffset([], 5);
    expect(offset).toBe(0);
  });

  it("returns lowest offset on a tie", () => {
    const existing = [
      { cadenceMinutes: 5, phaseOffsetMinutes: 0 },
      { cadenceMinutes: 5, phaseOffsetMinutes: 1 },
      { cadenceMinutes: 5, phaseOffsetMinutes: 2 },
      { cadenceMinutes: 5, phaseOffsetMinutes: 3 },
    ];
    const offset = pickLeastLoadedOffset(existing, 5);
    expect(offset).toBe(4);
  });

  it("handles cadence=1 (only valid offset is 0)", () => {
    const offset = pickLeastLoadedOffset([], 1);
    expect(offset).toBe(0);
  });
});
