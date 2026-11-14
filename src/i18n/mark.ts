// Marks a name that is also data (a scale, an instrument) for translators. The
// name itself stays English in the logic and in saved files; tName (utils/i18n.ts)
// translates it only where it's shown. Has no imports, so the main process can use it.
export const n = (name: string): string => name
