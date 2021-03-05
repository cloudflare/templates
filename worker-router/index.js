const { Router } = require('8track');

// Create a new router
const router = new Router()

/*
Our index route, a simple hello world.
*/
router.get`/`.handle(ctx => {
  ctx.html("Hello, world! This is the root page of your Worker template.");
})

/*
This route demonstrates path parameters, allowing you to extract fragments from the request
URL.

Try visit /example/hello and see the response.
*/
router.get`/example/${'input'}`.handle(ctx => {
  // Decode text like "Hello%20world" into "Hello world"
  let input = decodeURIComponent(ctx.params.input);

  // Construct a buffer from our input
  let buffer = Buffer.from(input, "utf8");

  // Serialise the buffer into a base64 string
  let base64 = buffer.toString("base64");

  // Return the HTML with the string to the client
  ctx.html(`<p>Base64 encoding: <code>${base64}</code></p>`);
})

/*
This shows a different HTTP method, a POST.

Try send a POST request using curl or another tool.

Try the below curl command to send JSON:

$ curl -X POST <worker> -H "Content-Type: application/json" -d '{"abc": "def"}'
*/
router.post`/post`.handle(async ctx => {
  let req = ctx.event.request;

  let fields = {
    "asn": req.cf.asn,
    "colo": req.cf.colo
  }

  if (req.headers.get("Content-Type") === "application/json") {
    fields["json"] = await req.json()
  }

  ctx.json(fields);
})

/*
This is the last route we define, it will match anything that hasn't hit a route we've defined
above, therefore it's useful as a 404 (and avoids us hitting worker exceptions, so make sure to include it!).

Visit any page that doesn't exist (e.g. /foobar) to see it in action.
*/
router.all`(.*)`.handle(ctx => {
  ctx.html("404, not found!", { status: 404 })
})

/*
This snippet ties our worker to the router we deifned above, all incoming requests
are passed to the router where your routes are called and the response is sent.
*/
addEventListener('fetch', (e) => {
  e.respondWith(router.getResponseForEvent(e))
})
