## Postgres

`postgres/docker-compose.yml`

This docker-compose composition will get you up and running with a local instance of `postgresql`, 
`pgbouncer` in front to provide connection pooling, and a copy of `cloudflared` to enable your 
applications to securely connect, through a encrypted tunnel, without opening any ports up locally.

### Usage

> from within `scripts/postgres`, run: 

1. **Create credentials file (first time only)**
```sh
docker run -v ~/.cloudflared:/etc/cloudflared cloudflare/cloudflared:2021.10.5 login
```

2. **Start a local dev stack (cloudflared/pgbouncer/postgres)**
```sh
TUNNEL_HOSTNAME=dev.example.com docker-compose up
```