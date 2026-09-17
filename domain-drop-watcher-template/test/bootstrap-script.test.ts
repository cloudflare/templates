import { describe, it, expect } from 'vitest'

const BASE64URL_43_RE = /^[A-Za-z0-9_-]{43}$/

type ExecFileSyncFn = (cmd: string, args: string[], opts?: { encoding?: string; input?: string }) => string
type RandomBytesFn = (n: number) => { toString: (enc: string) => string }
type ReadFileSyncFn = (path: string, encoding: string) => string

interface BootstrapDeps {
  execFileSync: ExecFileSyncFn
  randomBytes?: RandomBytesFn
  args?: string[]
  readFileSync?: ReadFileSyncFn
}

type MainFn = (deps?: BootstrapDeps) => Promise<void>

let mainFn: MainFn | undefined

async function getMain(): Promise<MainFn> {
  if (!mainFn) {
    const mod = await import('../scripts/bootstrap-admin-token.mjs') as { main: MainFn }
    mainFn = mod.main
  }
  return mainFn
}

function makeExecFileSync(listOutput: string | Error, putError?: Error): ExecFileSyncFn & { calls: Array<[string, string[], unknown]> } {
  const calls: Array<[string, string[], unknown]> = []
  const fn = (cmd: string, args: string[], opts?: unknown) => {
    calls.push([cmd, args, opts])
    if (args[0] === 'secret' && args[1] === 'list') {
      if (listOutput instanceof Error) throw listOutput
      return listOutput
    }
    if (args[0] === 'secret' && args[1] === 'put') {
      if (putError) throw putError
      return ''
    }
    return ''
  }
  ;(fn as unknown as { calls: typeof calls }).calls = calls
  return fn as ExecFileSyncFn & { calls: typeof calls }
}

describe('bootstrap-admin-token.mjs main()', () => {
  it('does not call wrangler secret put when ADMIN_TOKEN already listed', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([{ name: 'ADMIN_TOKEN' }, { name: 'SESSION_SECRET' }, { name: 'OTHER_SECRET' }])
    const mockExec = makeExecFileSync(listJson)

    await main({ execFileSync: mockExec })

    const putCalls = mockExec.calls.filter(([, args]) => args[1] === 'put')
    expect(putCalls.length).toBe(0)
  })

  it('generates a 43-char URL-safe base64 token and calls wrangler secret put via stdin when ADMIN_TOKEN absent', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([{ name: 'OTHER_SECRET' }, { name: 'SESSION_SECRET' }])
    const mockExec = makeExecFileSync(listJson)

    await main({ execFileSync: mockExec })

    const adminPutCalls = mockExec.calls.filter(([, args]) => args[1] === 'put' && args[2] === 'ADMIN_TOKEN')
    expect(adminPutCalls.length).toBe(1)

    const [cmd, args, opts] = adminPutCalls[0]! as [string, string[], { input: string }]
    expect(cmd).toBe('wrangler')
    expect(args).toEqual(['secret', 'put', 'ADMIN_TOKEN', '--name', 'domain-drop-watcher'])
    expect(typeof opts.input).toBe('string')
    expect(BASE64URL_43_RE.test(opts.input)).toBe(true)
  })

  it('generated token is exactly 43 chars and matches URL-safe base64 charset', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([{ name: 'SESSION_SECRET' }])
    const capturedInputs: string[] = []

    const mockExec: ExecFileSyncFn = (cmd, args, opts) => {
      if (args[0] === 'secret' && args[1] === 'list') return listJson
      if (args[0] === 'secret' && args[1] === 'put' && args[2] === 'ADMIN_TOKEN' && opts?.input) capturedInputs.push(opts.input)
      return ''
    }

    await main({ execFileSync: mockExec })

    expect(capturedInputs.length).toBe(1)
    const token = capturedInputs[0]!
    expect(token).toHaveLength(43)
    expect(BASE64URL_43_RE.test(token)).toBe(true)
  })

  it('treats "script not found" wrangler error as absent and proceeds; re-throws other errors', async () => {
    const main = await getMain()

    const scriptNotFound = new Error('script not found (10007)')
    const mockExec = makeExecFileSync(scriptNotFound)

    await main({ execFileSync: mockExec })

    const putCalls = mockExec.calls.filter(([, args]) => args[1] === 'put')
    expect(putCalls.length).toBe(2)

    const networkError = new Error('network timeout')
    const mockExecBad = makeExecFileSync(networkError)

    await expect(main({ execFileSync: mockExecBad })).rejects.toThrow('wrangler secret list failed unexpectedly')
  })

  it('generates SESSION_SECRET when absent and calls wrangler secret put with a 43-char base64url value', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([{ name: 'ADMIN_TOKEN' }])
    const mockExec = makeExecFileSync(listJson)

    await main({ execFileSync: mockExec })

    const putCalls = mockExec.calls.filter(([, args]) => args[1] === 'put')
    expect(putCalls.length).toBe(1)

    const [cmd, args, opts] = putCalls[0]! as [string, string[], { input: string }]
    expect(cmd).toBe('wrangler')
    expect(args).toEqual(['secret', 'put', 'SESSION_SECRET', '--name', 'domain-drop-watcher'])
    expect(typeof opts.input).toBe('string')
    expect(BASE64URL_43_RE.test(opts.input)).toBe(true)
  })

  it('does not call wrangler secret put when both ADMIN_TOKEN and SESSION_SECRET already exist', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([{ name: 'ADMIN_TOKEN' }, { name: 'SESSION_SECRET' }])
    const mockExec = makeExecFileSync(listJson)

    await main({ execFileSync: mockExec })

    const putCalls = mockExec.calls.filter(([, args]) => args[1] === 'put')
    expect(putCalls.length).toBe(0)
  })

  it('generates both ADMIN_TOKEN and SESSION_SECRET when both are absent', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([])
    const mockExec = makeExecFileSync(listJson)

    await main({ execFileSync: mockExec })

    const putCalls = mockExec.calls.filter(([, args]) => args[1] === 'put')
    expect(putCalls.length).toBe(2)

    const secretNames = putCalls.map(([, args]) => args[2])
    expect(secretNames).toContain('ADMIN_TOKEN')
    expect(secretNames).toContain('SESSION_SECRET')

    for (const [, , opts] of putCalls as Array<[string, string[], { input: string }]>) {
      expect(BASE64URL_43_RE.test(opts.input)).toBe(true)
    }
  })

  it('generates only SESSION_SECRET when ADMIN_TOKEN already exists but SESSION_SECRET is absent', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([{ name: 'ADMIN_TOKEN' }])
    const capturedPuts: Array<{ name: string; input: string }> = []

    const mockExec: ExecFileSyncFn = (cmd, args, opts) => {
      if (args[0] === 'secret' && args[1] === 'list') return listJson
      if (args[0] === 'secret' && args[1] === 'put') {
        capturedPuts.push({ name: args[2]!, input: (opts as { input: string }).input })
      }
      return ''
    }

    await main({ execFileSync: mockExec })

    expect(capturedPuts.length).toBe(1)
    expect(capturedPuts[0]!.name).toBe('SESSION_SECRET')
    expect(BASE64URL_43_RE.test(capturedPuts[0]!.input)).toBe(true)
  })

  it('resolves worker name from wrangler.json env block when --env demo is passed', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([])
    const mockExec = makeExecFileSync(listJson)

    const mockWrangler = JSON.stringify({
      name: 'domain-drop-watcher',
      env: { demo: { name: 'domain-drop-watcher-demo' } }
    })
    const mockReadFileSync: ReadFileSyncFn = () => mockWrangler

    await main({ execFileSync: mockExec, args: ['--env', 'demo'], readFileSync: mockReadFileSync })

    // wrangler doubles the env suffix when --name and --env are both set, so
    // resolveWorkerName produces the final name and --env is NOT forwarded.
    const allCalls = mockExec.calls
    for (const [, args] of allCalls) {
      expect(args).not.toContain('--env')
      expect(args).toContain('domain-drop-watcher-demo')
    }
  })

  it('calls wrangler secret put with the resolved worker name and no --env flag when both secrets absent', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([])
    const mockExec = makeExecFileSync(listJson)

    const mockWrangler = JSON.stringify({
      name: 'domain-drop-watcher',
      env: { demo: { name: 'domain-drop-watcher-demo' } }
    })
    const mockReadFileSync: ReadFileSyncFn = () => mockWrangler

    await main({ execFileSync: mockExec, args: ['--env', 'demo'], readFileSync: mockReadFileSync })

    const putCalls = mockExec.calls.filter(([, args]) => args[1] === 'put')
    expect(putCalls.length).toBe(2)

    for (const [cmd, args] of putCalls) {
      expect(cmd).toBe('wrangler')
      expect(args).toContain('domain-drop-watcher-demo')
      expect(args).not.toContain('--env')
    }
  })

  it('uses default worker name domain-drop-watcher when no --env flag is passed', async () => {
    const main = await getMain()
    const listJson = JSON.stringify([])
    const mockExec = makeExecFileSync(listJson)

    await main({ execFileSync: mockExec, args: [] })

    const putCalls = mockExec.calls.filter(([, args]) => args[1] === 'put')
    expect(putCalls.length).toBe(2)

    for (const [, args] of putCalls) {
      expect(args).toContain('domain-drop-watcher')
      expect(args).not.toContain('--env')
    }
  })
})
