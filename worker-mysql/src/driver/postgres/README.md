This directory contains the source for the original bundled driver as well as artifcats created by 
`edgeworkerizer.py` to enable it to run on Cloudflare Workers.

### Bundle Deno PostgreSQL driver
deno bundle https://deno.land/x/postgres@v0.13.0/mod.ts > postgres.js.deno

python3 edgeworkerizer.py postgres.js.deno > postgres.js

cp *.wasm ../../../dist/