# Edge Cache HTML

Supports Edge-caching HTML for not-logged-in users in coordination with a Content Management System (CMS) that supports x-HTML-Edge-Cache headers (either directly or through a plugin). A plugin is provided for WordPress as an example.

Installation instructions are available [below](#Installation).

## How it works

## Installation

Edge caching support requires a Cloudflare Worker script that runs on the edge as well as a content management system (like WordPress) that supports integrating with the worker. A plugin for WordPress support is available as part of this sample [here](WordPress%20Plugin/).

### Cache Purging

The worker purges the cache when content changes using one of two methods. If [Cloudflare Workers KV](https://www.cloudflare.com/products/workers-kv/) is enabled on the account and configured it is the preferred method as it only purges the HTML content when changes are detected, leaving other static resources in the cache (images, scripts, etc).  If KV isn't available it can use the Cloudflare API to purge the cache for the zone but that clears the entire cache.

#### KV Cache Purging
For KV-based cache purging a KV namespace is needed. To configure a namespace go to the Workers tab on the Cloudflare dashboard and scroll to the bottom of the page.

![Workers Dashboard](docs/dashboard-workers-noedit.png)

The name of the KV store doesn't matter - use something memorable and descriptive so you know what it was for. If you already have a KV store then that can also be reused as the Worker only uses a single key in the store (for storing the current cache version).

![KV Store](docs/workers-kv.png)

#### API
Purging using the API (only when KV is not available) requires configuring the script with an API key, account email address and zone ID. THere is a section at the top of the script where each value should be entered.

The zone ID is available on the main dashboard page in a box in the bottom-right corner:

![Zone ID](docs/dashboard-zone-id.png)

The account email address and API key are both available on the [profile page](https://dash.cloudflare.com/profile) for your account.

![Profile Page](docs/dashboard-profile.png)

### Worker Script
Once the cache purging configuration is available it is time to actually install the worker script to run for your zone.  That is done through the workers tab in the dashboard by clicking on the "Launch EDitor" button.

![Launch Editor](docs/dashboard-workers.png)

Your editor may look slightly different depending on the account level and if support for multiple worker scripts is enabled or not but the basics should be the same. To get to the actual script editor you will either click on a button to edit or add the script:

![Scripts](docs/workers-scripts.png)

If you are using KV to purge the cache you need to bind the namespace to a variable in your worker named EDGE_CACHE. That is done through the "Resources" tab on the right side of the code editor window. The variable name MUST be EDGE_CACHE otherwise the script will not work.  If you are using API cache purging then you can skip the key binding and go directly to inserting the worker code.

![Resources](docs/workers-resources.png)

![Add KV Binding](docs/workers-kv-binding.png)

![KV Bound](docs/workers-kv-bound.png)

Inserting the worker code is just a matter of copy/pasting the [worker code](https://raw.githubusercontent.com/cloudflare/worker-examples/master/examples/edge-cache-html/edge-cache-html.js) into the "Code" view of the editor. Make sure to delete the contents of any existing script before pasting the new script. After pasting the script make sure to hit the "Save" button at the bottom of the editor.

![Edit Code](docs/workers-code.png)

THe worker is not active until a route for it has been configured to tell it what URLs it should be invoked for. That is done in the "Routes" tab of the worker editor:

![Routes](docs/workers-routes.png)

Make sure to configure a route that covers all of the pages for your site. There is no harm if it also includes more than just the HTML pages as everything else is passed through unmodified. It is usually easiest to just set up a wildcard route that covers all URLs for the domains:

![Create Route](docs/workers-create-route.png)

After saving the route the worker should be active for your zone and ready to cache HTML if the origin supports it (like [WordPress with the plugin](WordPress%20Plugin/)).
