import type { BudgetReport } from "./types.js";

export interface BudgetInput {
  domains: Array<{
    cadenceMinutes: number;
    phaseOffsetMinutes: number;
    paused: boolean;
    tldSupported: boolean;
  }>;
  subreqLimitPerMinute?: number;
}

export type { BudgetReport };

function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

export function computeBudget(input: BudgetInput): BudgetReport {
  const limit = input.subreqLimitPerMinute ?? 45;
  const active = input.domains.filter((d) => !d.paused && d.tldSupported);
  const warnings: string[] = [];

  if (active.length === 0) {
    return {
      checksPerDay: 0,
      peakDuePerMinute: 0,
      peakBucketMinute: 0,
      d1WritesPerDay: 0,
      withinFreeTier: true,
      headroom: limit,
      warnings,
    };
  }

  for (const d of active) {
    if (d.cadenceMinutes < 1) {
      warnings.push(`Domain with cadence ${d.cadenceMinutes}min is below minimum of 1.`);
    }
  }

  const distinctCadences = [...new Set(active.map((d) => d.cadenceMinutes))];
  // LCM across distinct cadences, capped at 1440 — domains with cadences > 1440 only run daily
  let window = 1;
  for (const c of distinctCadences) {
    window = lcm(window, c);
    if (window > 1440) {
      window = 1440;
      break;
    }
  }

  let peak = 0;
  let peakBucketMinute = 0;

  for (let m = 0; m < window; m++) {
    let cnt = 0;
    for (const d of active) {
      if (m % d.cadenceMinutes === d.phaseOffsetMinutes) {
        cnt++;
      }
    }
    if (cnt > peak) {
      peak = cnt;
      peakBucketMinute = m;
    }
  }

  const checksPerDay = active.reduce(
    (sum, d) => sum + Math.floor(1440 / d.cadenceMinutes),
    0,
  );
  const d1WritesPerDay = checksPerDay + Math.floor(checksPerDay * 0.05);
  const headroom = limit - peak;
  const withinFreeTier = peak <= limit && d1WritesPerDay <= 100000;

  if (peak > 40) {
    warnings.push(`Peak of ${peak} domains/min is approaching the ${limit} subrequest limit.`);
  }
  if (d1WritesPerDay > 80000) {
    warnings.push(`Estimated ${d1WritesPerDay} D1 writes/day is approaching the 100k free-tier limit.`);
  }

  return {
    checksPerDay,
    peakDuePerMinute: peak,
    peakBucketMinute,
    d1WritesPerDay,
    withinFreeTier,
    headroom,
    warnings,
  };
}

export function pickLeastLoadedOffset(
  existingDomains: Array<{ cadenceMinutes: number; phaseOffsetMinutes: number }>,
  proposedCadence: number,
): number {
  let bestOffset = 0;
  let bestPeak = Infinity;

  for (let o = 0; o < proposedCadence; o++) {
    const candidate = [...existingDomains, { cadenceMinutes: proposedCadence, phaseOffsetMinutes: o }];
    const report = computeBudget({
      domains: candidate.map((d) => ({
        cadenceMinutes: d.cadenceMinutes,
        phaseOffsetMinutes: d.phaseOffsetMinutes,
        paused: false,
        tldSupported: true,
      })),
    });
    if (report.peakDuePerMinute < bestPeak) {
      bestPeak = report.peakDuePerMinute;
      bestOffset = o;
    }
  }

  return bestOffset;
}
