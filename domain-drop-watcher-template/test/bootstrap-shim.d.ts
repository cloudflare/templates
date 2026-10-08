type ExecFileSyncFn = (cmd: string, args: string[], opts?: { encoding?: string; input?: string }) => string
type RandomBytesFn = (n: number) => { toString: (enc: string) => string }
type ReadFileSyncFn = (path: string, encoding: string) => string

interface BootstrapDeps {
  execFileSync?: ExecFileSyncFn
  randomBytes?: RandomBytesFn
  args?: string[]
  readFileSync?: ReadFileSyncFn
}

declare module '../scripts/bootstrap-admin-token.mjs' {
  export function main(deps?: BootstrapDeps): Promise<void>
}
