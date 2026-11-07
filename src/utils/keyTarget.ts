// ── Is this key meant for a field the user is typing in? ─────────────────────
// Shortcuts stay out of the way of text fields. A slider is an <input> too, but
// nothing is typed into it, so Space and the other shortcuts still work there.
export function isTextEntry(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; type?: string } | null
  return el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && el.type !== 'range')
}
