/**
 * tsconfig.app.json keeps @types/node out of the program, so feel.test.ts (which writes docs/qa/code-lab-core/FEEL.md)
 * gets this narrow shim. Declarations merge with src/test/node-fs.d.ts.
 */
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void
  export function mkdirSync(path: string, options: { recursive: boolean }): void
}
declare module 'node:path' {
  export function dirname(path: string): string
  export function resolve(...paths: string[]): string
}
declare const process: { cwd(): string }
