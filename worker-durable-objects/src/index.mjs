// Worker

export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  }
}

async function handleRequest(request, env) {
  let id = env.Counter.idFromName("A");
  let obj = env.Counter.get(id);
  let resp = await obj.fetch(request.url);
  let count = await resp.text();

  return new Response("Durable Object 'A' count: " + count);
}

// Durable Object

export class Counter {
  constructor(state, env) {
    this.state = state;
  }

  async initialize() {
    try {
      let stored = await this.state.storage.get("value");
      this.value = stored || 0;
    } catch (err) {
      // If anything throws during initialization then we
      // need to be sure that a future request will retry by
      // creating another `initializePromise` below.
      this.initializePromise = undefined;
      throw err;
    }
  }

  // Handle HTTP requests from clients.
  async fetch(request) {
    // Make sure we're fully initialized from storage.
    if (!this.initializePromise) {
      this.initializePromise = this.initialize();
    }
    await this.initializePromise;

    // Apply requested action.
    let url = new URL(request.url);
    let currentValue = this.value;
    switch (url.pathname) {
    case "/increment":
      currentValue = ++this.value;
      await this.state.storage.put("value", this.value);
      break;
    case "/decrement":
      currentValue = --this.value;
      await this.state.storage.put("value", this.value);
      break;
    case "/":
      // Just serve the current value. No storage calls needed!
      break;
    default:
      return new Response("Not found", {status: 404});
    }

    // Return `currentValue`. Note that `this.value` may have been
    // incremented or decremented by a concurrent request when we
    // yielded the event loop to `await` the `storage.put` above!
    // That's why we stored the counter value created by this
    // request in `currentValue` before we used `await`.
    return new Response(currentValue);
  }
}
