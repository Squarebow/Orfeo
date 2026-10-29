import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { SettingId } from './catalog'

// ── One setting's controls. Words live in catalog.ts (same id); the
// Settings window card and the Quick Settings row both draw from this. ──
export interface SettingDef {
  id: SettingId
  icon: LucideIcon
  // 'switch': Control is a Switch, drawn at the right of the name line.
  // 'inline': any small control drawn at the right of the name line (App Zoom).
  // 'choice': Control is a row of buttons / a stepper, drawn under the name.
  kind: 'switch' | 'inline' | 'choice'
  Control: ComponentType
  Glance?: ComponentType        // short at-a-glance line(s): shown in BOTH Quick Settings and the window
  glanceQuickOnly?: boolean     // the window's description already says it — Quick Settings only
  Extra?: ComponentType         // follow-up options / parameters: window only
  Description?: ComponentType   // richer window description (inline icons); falls back to catalog text
  NameSuffix?: ComponentType    // live value after the name, e.g. "— 100%"
  NameRight?: ComponentType     // small readout at the right end of the name line — Setup only (choice settings)
  useVisible?: () => boolean    // hook; false hides the setting in both places
  badge?: 'beta'
  // 'controlFirst': the control right under the name, then the glance lines, then
  // the description (which may change with the choice), then the follow-up options
  layout?: 'controlFirst'
  QuickExtra?: ComponentType    // follow-up control shown in Setup only (under the glance)
  SummaryEnd?: ComponentType    // inline at the end of the Setup summary line (e.g. a link)
  notice?: boolean              // amber-bordered, for an information card
}
