import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'

const SECRET_NAME = 'ADMIN_TOKEN'
const SESSION_SECRET_NAME = 'SESSION_SECRET'

function resolveWorkerName(args, readFileFn) {
  const envIdx = args.indexOf('--env')
  if (envIdx === -1) return 'domain-drop-watcher'
  const envName = args[envIdx + 1]
  const wrangler = JSON.parse(readFileFn('wrangler.json', 'utf8'))
  return wrangler.env?.[envName]?.name || `domain-drop-watcher-${envName}`
}

function checkSecretExists(workerName, secretName, runExecFileSync, envFlag) {
  let output
  try {
    output = runExecFileSync(
      'wrangler',
      ['secret', 'list', '--name', workerName, '--format', 'json', ...envFlag],
      { encoding: 'utf8' }
    )
  } catch (err) {
    const msg = String(err?.message ?? err)
    if (
      msg.includes('script not found') ||
      msg.includes('does not exist') ||
      msg.includes('10007')
    ) {
      return false
    }
    throw new Error(`wrangler secret list failed unexpectedly: ${msg}`)
  }

  let parsed
  try {
    parsed = JSON.parse(output)
  } catch {
    throw new Error(`wrangler secret list returned non-JSON output: ${output}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`wrangler secret list returned non-array JSON: ${output}`)
  }

  return parsed.some((entry) => entry?.name === secretName)
}

export async function main(deps) {
  const runExecFileSync = deps?.execFileSync ?? execFileSync
  const genBytes = deps?.randomBytes ?? randomBytes
  const readFileFn = deps?.readFileSync ?? fs.readFileSync

  const args = deps?.args ?? process.argv.slice(2)
  const WORKER_NAME = resolveWorkerName(args, readFileFn)
  // Wrangler v3 doubles the env suffix when --name and --env are both set
  // (e.g. `--name foo-demo --env demo` writes to `foo-demo-demo`). resolveWorkerName
  // already produces the final name, so --env must NOT be forwarded to the secret commands.
  const ENV_FLAG = []

  const adminTokenExists = checkSecretExists(WORKER_NAME, SECRET_NAME, runExecFileSync, ENV_FLAG)
  const sessionSecretExists = checkSecretExists(WORKER_NAME, SESSION_SECRET_NAME, runExecFileSync, ENV_FLAG)

  if (adminTokenExists && sessionSecretExists) {
    process.stdout.write(
      `[bootstrap] ${SECRET_NAME} already exists — leaving unchanged.\n` +
      `[bootstrap] ${SESSION_SECRET_NAME} already exists — leaving unchanged.\n`
    )
    return
  }

  let adminToken = null
  let sessionSecret = null

  if (!adminTokenExists) {
    adminToken = genBytes(32).toString('base64url')
    runExecFileSync(
      'wrangler',
      ['secret', 'put', SECRET_NAME, '--name', WORKER_NAME, ...ENV_FLAG],
      { input: adminToken, encoding: 'utf8' }
    )
  } else {
    process.stdout.write(
      `[bootstrap] ${SECRET_NAME} already exists — leaving unchanged.\n`
    )
  }

  if (!sessionSecretExists) {
    sessionSecret = genBytes(32).toString('base64url')
    runExecFileSync(
      'wrangler',
      ['secret', 'put', SESSION_SECRET_NAME, '--name', WORKER_NAME, ...ENV_FLAG],
      { input: sessionSecret, encoding: 'utf8' }
    )
  } else {
    process.stdout.write(
      `[bootstrap] ${SESSION_SECRET_NAME} already exists — leaving unchanged.\n`
    )
  }

  const border = '='.repeat(60)
  const lines = [`\n${border}\n`]

  if (adminToken !== null) {
    lines.push(
      `[bootstrap] ADMIN_TOKEN generated and stored as a Cloudflare Secret.\n` +
      `\n` +
      `  Token: ${adminToken}\n` +
      `\n` +
      `Copy this token now — it will not be shown again.\n` +
      `Open your Worker URL and log in with this token.\n` +
      `\n` +
      `To rotate: delete the ADMIN_TOKEN Secret in the Cloudflare dashboard\n` +
      `(Workers & Pages -> domain-drop-watcher -> Settings -> Variables and Secrets)\n` +
      `then trigger a new deploy. The build log will show the new token once.\n`
    )
  }

  if (sessionSecret !== null) {
    if (adminToken !== null) lines.push(`\n`)
    lines.push(
      `[bootstrap] SESSION_SECRET generated and stored as a Cloudflare Secret.\n` +
      `\n` +
      `  Secret: ${sessionSecret}\n` +
      `\n` +
      `This secret signs session cookies. Rotating it invalidates all active sessions.\n` +
      `To rotate: delete SESSION_SECRET in the Cloudflare dashboard then redeploy.\n`
    )
  }

  lines.push(`${border}\n\n`)
  process.stdout.write(lines.join(''))
}

import { fileURLToPath } from 'node:url'

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[bootstrap] FATAL: ${err?.message ?? err}\n`)
    process.exit(1)
  })
}
