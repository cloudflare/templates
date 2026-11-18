[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/containers-template)

# Containers Starter

![Containers Template Preview](https://imagedelivery.net/_yJ02hpOMj_EnGvsU2aygw/5aba1fb7-b937-46fd-fa67-138221082200/public)

<!-- dash-content-start -->

Run a Go HTTP server in [Cloudflare Containers](https://developers.cloudflare.com/containers/), with a Worker routing requests to named instances, a single shared instance, or a pool of three instances.

The template uses the `durable_object` scheduling policy. Each Durable Object selects its container image and size, passes environment variables at startup, waits for HTTP readiness, and monitors the container's exit. An intentional-failure route demonstrates error handling.

<!-- dash-content-end -->

## Get started

Install Node.js and start a Docker-compatible engine before running this template locally. The template pins Wrangler 4.136.1; local development with the `durable_object` policy requires Wrangler 4.136.0 or later.

Create a project with [C3](https://developers.cloudflare.com/workers/get-started/guide/):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/containers-template
```

From your new project directory, install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) to see the available endpoints. The first container request builds and starts the Go server, so it can take longer than subsequent requests.

## Try the routes

| Route            | Behavior                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `/`              | List the available endpoints without starting a container.                                          |
| `/container/one` | Start or reuse the named instance `one`. Change the final path segment to use a different instance. |
| `/singleton`     | Route every request to the same shared instance.                                                    |
| `/lb`            | Randomly select one of three named instances. This is a fixed pool.                                 |
| `/error`         | Stop a dedicated test instance with exit code 1. The Worker returns HTTP 502 and logs the failure.  |

```bash
curl http://localhost:8787/container/one
curl http://localhost:8787/container/two
curl http://localhost:8787/singleton
curl http://localhost:8787/lb
curl -i http://localhost:8787/error
```

Successful container responses include the startup message and Durable Object ID. The Worker passes its ID through `INSTANCE_ID` so the output identifies each instance in both local development and deployed applications. Repeated requests for the same name reach the same Durable Object. A stopped container starts again on the next request; its local filesystem is not persistent application storage.

The `/lb` pool has three names, but `/container/<ID>` can start additional instances. Add authentication and application-specific limits before exposing arbitrary instance creation to users. Running containers count toward your [account limits](https://developers.cloudflare.com/containers/platform/limits/#account-limits).

## How it works

`wrangler.jsonc` associates the `MyContainer` Durable Object with the `durable_object` policy. The named image `base` is built from `Dockerfile` and exposed as `ctx.container.images.base`. The `exports` entry declares the class with SQLite storage.

In `src/index.ts`, `MyContainer` extends `DurableObject` from `cloudflare:workers`. Its `fetch()` method:

1. Starts the configured image with the `lite` instance size, outbound Internet access turned off, and `MESSAGE` and `INSTANCE_ID` environment variables.
2. Waits for a successful response from `/health` on port 8080. Concurrent requests share this readiness check.
3. Forwards the incoming request to `ctx.container.getTcpPort(8080)`. Application requests are not automatically retried.

`monitor()` logs successful exits and failures. The Durable Object restores monitoring and its two-minute inactivity timeout when it restarts with an existing container. A pending monitor can keep the Durable Object active for up to 15 minutes, so the inactivity timeout is **not** a two-minute deadline from the last HTTP request. See the [Container API lifecycle methods](https://developers.cloudflare.com/containers/api/durable-object-container/#monitor).

Edit `container_src/main.go` to change the Go server and `src/index.ts` to change routing or startup options. Set runtime environment variables in `start({ env: { ... } })`. Keep secrets out of source code; use [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) when needed.

## Check your changes

```bash
npm run cf-typegen
npm run check
npm test
```

The unit tests run the Worker code with mocked container boundaries, without Docker. To test the actual image, use `npm run dev` and the routes above. If Go is installed locally, run its handler and process-exit tests too:

```bash
cd container_src
go test ./...
```

## Deploy

With Docker running, deploy the Worker and its named image:

```bash
npm run deploy
```

Use the deployed Worker URL to try the same routes. Container instances start when they receive requests. Updating the named image does not restart existing instances; running instances keep their startup image until they stop. See [image updates](https://developers.cloudflare.com/containers/guides/image-management/#roll-out-a-named-image-update).

## Learn more

- [Containers examples](https://developers.cloudflare.com/containers/examples/)
- [Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/)
- [Scheduling policy](https://developers.cloudflare.com/containers/configuration/scheduling-policy/#use-the-durable-object-scheduling-policy)
- [Local development](https://developers.cloudflare.com/containers/guides/local-dev/)
