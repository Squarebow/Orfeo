// ── i18n placeholder — mirrors ttag's tagged-template `t` API so new strings
// wrapped now migrate to real ttag later via a one-line import swap, with no
// call-site changes. Currently a no-op passthrough: no catalog is loaded,
// so this just returns the interpolated string as-is (same as English source).
// See docs/I18N_PLAN.md (gitignored) for the full rollout plan.
export function t(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, str, i) => acc + str + (i < values.length ? String(values[i]) : ''), '')
}
