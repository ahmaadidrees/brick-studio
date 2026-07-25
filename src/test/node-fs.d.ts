/**
 * tsconfig.app.json pins `types` to the browser/test globals, so @types/node is out of the
 * program. Tests that read a source file off disk get this narrow shim instead of pulling
 * Node's globals into the app's type-checking surface.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}
