# Template: worker-tidb

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-tidb)

This repo contains example code and a MySQL driver that can be used in any Workers project. If you are interested in using the driver _outside_ of this template, copy the `driver/mysql` module into your project's `node_modules` or directly alongside your source.


## Usage

Before you start, please refer to the **[official tutorial](https://developers.cloudflare.com/workers/tutorials/query-postgres-from-workers-using-database-connectors)**.

## Quick Start

### Prerequisites

- Your TiDB cluster
- Free Cloudflare Workers account
- Free GitHub account
- Node.js & NPM installed
- Git installed
- A Domain belongs to you

### Step1: Build your TiDB locally

Using TiUP to build your TiDB locally, you can find the detail in [TiDB documentation](https://docs.pingcap.com/tidb/stable/quick-start-with-tidb).

1. Download and install TiUP:

```
curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh
```

2. Start the cluster:
```
tiup playground
```

### Step 2: Create a tunnel

Create a tunnel by:
- [Remotely on the Zero Trust dashboard](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/remote/#set-up-a-tunnel-remotely-dashboard-setup)
- [Locally, using your CLI](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/local/#set-up-a-tunnel-locally-cli-setup)

Here, I will introduce how to create a tunnel locally in my environment. You can find all the detail in the link above.

1. Add a website to Cloudflare using your domain.

2. Download and install cloudflared in mac:

```
brew install cloudflare/cloudflare/cloudflared
```
3. Authenticate cloudflared:

```
cloudflared tunnel login
```

4. Create a tunnel and give it a name:

```
cloudflared tunnel create <NAME>
```

5. Create a configuration file:

Create a configuration file in your .cloudflared directory.

- `url` is your TiDB address, make sure use the tcp protocol.
- You can find the `Tunnel-UUID` with `cloudflared tunnel list` command.

```
url: tcp://127.0.0.1:4000
tunnel: <Tunnel-UUID>
credentials-file: /root/.cloudflared/<Tunnel-UUID>.json
```


6. Start routing traffic:

This step will assign a CNAME record that points traffic to your tunnel subdomain.

- `UUID or NAME` is your tunnel's UUID or name.
- hostname must be a subdomain of your website. For example, my domain is `example.com`. So I can use `tidb.example.com` as my hostname.

```
cloudflared tunnel route dns <UUID or NAME> <hostname>
```

7.Run the tunnel:

```
cloudflared tunnel run <UUID or NAME>
```

### Step 3: Deploy worker by template

1. Get the template:

```
git clone git@github.com:cloudflare/templates.git
cd worker-tidb
```

2. Database connection settings:

Edit the `src/index.ts` likes below:

- the `hostname` property must be the URL to your Cloudflare Tunnel, _NOT_ your database host.
	- your Tunnel will be configured to connect to your database host.

```ts
const tidb = new Client();
const connect = await tidb.connect({
	username: 'root',
	db: 'test',
	hostname: env.TUNNEL_HOST || 'https://tidb.example.com', // your tunnel host
	password: env.DATABASE_PASSWORD || '', // use a secret to store passwords
});
```

3. Query TiDB settings:

The template always use `SELECT 42` to query the TiDB. You can edit the `src/index.ts` to change the query as you wish. Here is an example:

```ts
// Query the database.

// Parse the URL, and get the 'table' query parameter (which may not exist)
const url = new URL(request.url);
const projection = url.searchParams.get('projection');
const filter = url.searchParams.get('filter');
const table = url.searchParams.get('table');

if (!table){
	return new Response('Please provide a table name', {
		status: 400,
	});
}

let query = ''
if (project){
	query += `SELECT ${projection} FROM ${table}`
}else{
	query += `SELECT * FROM ${table}`
}
if(filter){
	query+= ` WHERE ${filter}`
}

const result = await connect.query(query);
// Return result from database.
return new Response(JSON.stringify({ result }));
```

4. Deploy worker

Edit the wrangler.toml file with to fill in your worker name:

```
name = "tidb-test"
```

Build the template needs `esbuild`. So you need to install `esbuild`:

```
npm install esbuild
```

Use wrangler to deploy your worker:

```
npm install -g wrangler
wrangler publish
```


### Step 4: Insert data into TiDB and try your worker

Before you try your worker, insert some data into your TiDB:

```
CREATE TABLE `test`.`t`  (
  `id` int(11) NOT NULL,
  `name` varchar(255) NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
);
insert into test.t values (1,'test1'),(2,'test2'),(3,'test2')
```

Go to [cloudflare dashboard](https://dash.cloudflare.com/), and find your worker. You can find the URL of your worker in the overview page. As for me, my URL is `tidb.1136742008.workers.dev`.

Here is my results:

visit https://tidb.1136742008.workers.dev/

```
Please provide a table name
```

visit https://tidb.1136742008.workers.dev/?table=t
```
{"result":[{"id":1,"name":"test1"},{"id":2,"name":"test2"},{"id":3,"name":"test2"}]}
```

visit https://tidb.1136742008.workers.dev/?table=t&projection=id

```
{"result":[{"id":1},{"id":2},{"id":3}]}
```

visit https://tidb.1136742008.workers.dev/?table=t&projection=id&filter=name='test2'

```
{"result":[{"id":2},{"id":3}]}
```

## Limitation

- You can use worker-tidb to connect to remote TiDB too. For example, the TiDB Cloud dedicated tier. But worker-tidb can not work with TLS now, So serverless can not work with worker-tidb now.


