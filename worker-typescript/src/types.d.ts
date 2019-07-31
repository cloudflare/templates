import { KVNamespace } from '@cloudflare/workers-types'

declare global {
  const myKVNamespace: KVNamespace
}
