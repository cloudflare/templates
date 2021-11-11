# Cloudflare Workers + PostgreSQL

This repo contains example code and a PostgreSQL driver that can be used in any Workers project. If
you are interested in using the driver _outside_ of this template, copy the `driver/postgres` module
into your project's `node_modules` or directly alongside your source.

## Usage

Before you start, please refer to the [official tutorial](https://blog.cloudflare.com/tbd).

```typescript
const client = new Client({
    user: '<DATABASE_USER>',
    database: '<DATABASE_NAME>',
    // hostname is the full URL to your pre-created Cloudflare Tunnel, see documentation here:
    // https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/create-tunnel
    hostname: env.TUNNEL_HOST || 'https://dev.example.com',
    password: env.DATABASE_PASSWORD, // use a secret to store passwords
    port: '<DATABASE_PORT>',
})

await client.connect()
```

**Please Note:**
- you must use this config object format vs. a database connection string
- the `hostname` property must be the URL to your Cloudflare Tunnel, _NOT_ your database host
    - your Tunnel will be configured to connect to your database host

