// jzz-midi-smf / jzz-synth-tiny ship no type declarations and there's no
// @types package for either — both are only ever used as untyped plugin
// initializers (imported, then called with the JZZ instance), so an ambient
// `any`-shaped module is accurate to how they're actually consumed.
declare module 'jzz-midi-smf'
declare module 'jzz-synth-tiny'

// Injected by electron.vite.config.ts's renderer `define`, from package.json.
declare const __APP_VERSION__: string
