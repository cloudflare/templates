### Cloudflare Edge Proxy Examples

This is a set of examples utilizing the npm package `cloudflare-edge-proxy`.

#### Features

-   A/B/n testing across multiple backends, even running across multiple cloud providers
    -   A/B test any number of backends at the same time (not just limited to A & B)
    -   Easily a/b test different cloud providers against each other
    -   A/B test entirely different backend architectures or anything else!
-   Canary releasing with gradual traffic migration
    -   Don't risk sending all your live traffic to a new backend, instead role it out slowly with a `canary` release
    -   Allows for traffic migration in 1% increments from 0 to 100%
    -   During the gradual shirt, all migrated users will continue to be consistently routed to the new backend even as the allocation percentage increases
-   Dynamic Gatekeeping
    -   Develop new features on your production domain while only allowing access to privileged users
    -   Useful for fully testing a new release (on the production domain) before releasing to the public
    -   Implemented with JWT
-   SEO A/B testing
    -   Wonder if stuffing your meta tags with keywords helps or hurts ranking? Run an a/b test and measure the real-world impact on your natural search traffic volume.
    -   This example randomly assigns each URL to a given backend version, the underlying hashing function assures this random assignment is deterministic and will not change during the test

#### To run

`git clone git@github.com:cloudflare/worker-examples.git`

`cd worker-examples/examples/edge-proxy`

`npm install`

Edit the desired configuration file and import that file into `index.js`. The current default is importing `ab-testing.config.js`.

```js
// ab-testing.config.js
export default {
    abtest: true,
    origins: [
        { url: "https://a.com" },
        { url: "https://b.com" },
        { url: "https://c.com" }
        // any number of origins may be tested
    ],
    // this salt should be unique for each test so that users get randomized independently across tests
    salt: "test-abc-123",
    setCookie: true // default is false, if true proxy will set _vq cookie (otherwise backend must set it)
};
```

```js
// index.js
import cloudflareEdgeProxy from "cloudflare-edge-proxy";
import config from "./ab-testing.config";

const proxy = cloudflareEdgeProxy(config);

addEventListener("fetch", event => {
    event.respondWith(proxy(event));
});
```

To build run:

`npm run build`

Deploy the script from `dist` to your Cloudflare worker ([see Cloudflare docs for deployment instructions](https://developers.cloudflare.com/workers/about/)).

Note that to provide consistent assignments during a/b testing and canary releasing, a visitor id cookie must be set with the cookie name `_vq`. The value of this cookie should be taken from the `request-id` header or the cookie, if set. Optionally, you may request the proxy to set these cookies by adding `{setCookie: true}` in the config. The examples in this repo ask the proxy to set this cookie (simpler to set up).

The proxy repo (and docs) can be found at: https://github.com/DigitalOptimizationGroup/cloudflare-edge-proxy
