import type { DuplicateResult, PolicyDecision, RiskResult } from "./types";

export function calculateSocialRisk(input: {
  policy: PolicyDecision;
  duplicate: DuplicateResult;
  mediaCount: number;
  vipTeaser: boolean;
  platformDisabled: boolean;
}): RiskResult {
  const factors = {
    duplicate: input.duplicate.duplicate,
    mediaCount: input.mediaCount,
    vipTeaser: input.vipTeaser,
    requiresSensitive: input.policy.requiresSensitive,
    requiresApproval: input.policy.requiresApproval,
    platformDisabled: input.platformDisabled,
  };

  let score = 0;
  if (factors.platformDisabled) score += 4;
  if (!input.policy.allowed) score += 3;
  if (factors.duplicate) score += 2;
  if (factors.requiresApproval) score += 2;
  if (factors.vipTeaser) score += 1;
  if (factors.requiresSensitive) score += 1;
  if (factors.mediaCount === 0) score += 2;

  const level = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  return { level, factors };
}
