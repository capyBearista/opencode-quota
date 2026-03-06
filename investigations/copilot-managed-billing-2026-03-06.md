# Investigation: Copilot Managed Billing Review

## Summary
The current Copilot managed-billing work has one clear functional regression: valid zero-usage billing responses are converted into hard errors because empty `usageItems` arrays are rejected before organization or enterprise results are built. I also found older debt that the new modes make more visible, especially stale provider caching and incomplete quantity parsing.

## Symptoms
- The working tree is dirty in Copilot quota code, provider formatting, tests, and `README.md`.
- Recent history on March 6, 2026 includes a revert, a parsing fix, a merge-conflict cleanup, and the current managed-billing work.
- Focused Copilot and slash-command tests still pass, which means the current suite does not catch the main managed-billing failure mode.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** Recent Copilot organization/enterprise support may have introduced inconsistent data handling across parsing, formatting, and diagnostics.
**Findings:** The changed files are concentrated in `src/lib/copilot.ts`, `src/providers/copilot.ts`, `src/lib/quota-status.ts`, `src/lib/types.ts`, matching tests, and `README.md`. Recent commits show churn in the same area: `da32028`, `ba48c7e`, `976af5a`, `b2c9d03`.
**Evidence:** `git status` showed 8 modified files; `git log` showed `b2c9d03` on March 6, 2026 after same-day Copilot revert/fix commits.
**Conclusion:** Copilot managed billing is the correct investigation target.

### Phase 2 - Managed Billing Result Construction
**Hypothesis:** Organization and enterprise billing paths may reject otherwise valid API responses.
**Findings:** `getPremiumUsageItems()` throws when `usageItems` is empty, and both managed-billing success builders call it before constructing results.
**Evidence:** `src/lib/copilot.ts:677-699` throws `Billing API returned empty usageItems array for Copilot premium requests.`. `src/lib/copilot.ts:755-766` and `src/lib/copilot.ts:776-787` call `getPremiumUsageItems()` inside `toOrganizationUsageResultFromBilling()` and `toEnterpriseUsageResultFromBilling()`.
**Conclusion:** Confirmed regression. A valid current-period zero-usage response cannot be represented in managed mode.

### Phase 3 - Quantity Parsing
**Hypothesis:** The new billing response parser may ignore fields that GitHub can return.
**Findings:** The response item type includes both gross and net quantity fields, but usage summing only reads gross quantities.
**Evidence:** `src/lib/copilot.ts:99-101` defines `netQuantity` and `net_quantity`. `src/lib/copilot.ts:704-708` sums only `grossQuantity ?? gross_quantity ?? 0`.
**Conclusion:** Real parsing gap, but not proven to be introduced by the current managed-billing work. It is safer to classify as pre-existing or shared debt until a concrete `net_*` response is observed.

### Phase 4 - Provider Output and Lost Context
**Hypothesis:** User-facing managed Copilot output may discard important identifying context.
**Findings:** Managed results retain organization, enterprise, username, and billing-period metadata, but the provider adapter reduces them to a generic label and `${used} used`.
**Evidence:** `src/lib/types.ts:114-139` expands Copilot config and result metadata; `src/providers/copilot.ts:52-68` emits only `Copilot Org` or `Copilot Enterprise` plus `${used} used`; `src/lib/quota-status.ts:337-387` still prints the richer context in `/quota_status`.
**Conclusion:** Likely UX/design mistake, not a hard correctness bug. `/quota` and toasts are materially less informative than the underlying result object.

### Phase 5 - Provider Cache Behavior
**Hypothesis:** Copilot results may stay stale after PAT or billing-target changes.
**Findings:** Provider caching keys do not include any Copilot auth/config fingerprint, and any attempted result, including PAT/config errors, is cached.
**Evidence:** `src/plugin.ts:354-359` builds cache keys only from provider id, toast style, Google models, current-model filtering, and current model. `src/plugin.ts:391-399` stores any `result.attempted`. `git blame` attributes this cache logic to `d90b1de` from February 24, 2026, predating the current Copilot managed-billing work.
**Conclusion:** Pre-existing debt made more visible by the new PAT organization/enterprise states, not a regression introduced by the current worktree.

### Phase 6 - Command Boundary Regression Check
**Hypothesis:** Copilot changes may have accidentally broken the slash-command handled-sentinel boundary.
**Findings:** The hook still rethrows, and the regression test still asserts rejection with the sentinel.
**Evidence:** `src/plugin.ts:1211-1215` rethrows caught errors; `tests/plugin.command-handled-boundary.test.ts:76-132` expects `command.execute.before` to reject with `COMMAND_HANDLED_SENTINEL`.
**Conclusion:** Eliminated. No evidence of a slash-command sentinel regression.

### Phase 7 - Documentation and Test Coverage
**Hypothesis:** Tests or docs may have normalized incorrect behavior.
**Findings:** The README and tests explicitly document and enforce PAT-first, no-OAuth-fallback behavior. There are no tests for empty managed `usageItems` or `netQuantity`/`net_quantity`.
**Evidence:** `README.md:163-169` says invalid/unusable `copilot-quota-token.json` does not fall back to OAuth. `tests/lib.copilot.test.ts:166-182` enforces that behavior. No matches were found in `tests/lib.copilot.test.ts` for `netQuantity`, `net_quantity`, or `usageItems: []`.
**Conclusion:** No-fallback behavior is intentional product policy, not an accidental regression. The real gap is missing tests around zero-usage and alternate quantity fields.

## Root Cause
The managed-billing implementation reused the personal quota helper `getPremiumUsageItems()` without changing its error semantics for usage-only reporting. In `src/lib/copilot.ts:677-699`, the helper treats `usageItems: []` as an API error. Both managed-mode constructors then depend on that helper (`src/lib/copilot.ts:755-787`). For organization and enterprise billing, however, zero premium usage in the current billing period is a valid state. The implementation therefore rejects a legitimate response before it can return `{ success: true, mode: "organization_usage" | "enterprise_usage", used: 0, ... }`.

## Eliminated Hypotheses
- Slash-command handled-sentinel propagation is intact: `src/plugin.ts:1211-1215`, `tests/plugin.command-handled-boundary.test.ts:76-132`.
- PAT-first/no-fallback is documented and tested behavior, not an accidental regression: `README.md:163-169`, `tests/lib.copilot.test.ts:166-182`.
- Provider cache staleness is not newly introduced by the managed-billing patchset; it predates it in commit `d90b1de`.

## Recommendations
1. Change `src/lib/copilot.ts:677-699` so managed billing can represent zero usage when the billing API returns an empty `usageItems` array.
2. Add low-level tests in `tests/lib.copilot.test.ts` for `usageItems: []` in organization and enterprise modes, and for `netQuantity` / `net_quantity` fallback parsing.
3. Decide whether `/quota` and toast output should include organization/enterprise slug, billing period, and optional username filter for managed Copilot results; if yes, update `src/providers/copilot.ts:52-68` and matching tests.
4. Separately from this regression, consider invalidating or narrowing Copilot provider cache entries when PAT config changes, since the current cache key in `src/plugin.ts:354-359` ignores Copilot auth state.

## Preventive Measures
- Add contract tests for valid zero-usage billing responses before merging further Copilot billing changes.
- Keep low-level parser tests aligned with every field accepted by `BillingUsageItem`, especially mixed camelCase/snake_case responses.
- Treat `/quota` and `/quota_status` as separate UX surfaces with explicit requirements so rich managed-billing context is not silently lost in the provider adapter.
