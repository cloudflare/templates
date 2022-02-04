// Worker

export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  }
}

async function handleRequest(request, env) {
  let id = env.COUNTER.idFromName("A");
  let obj = env.COUNTER.get(id);
  let resp = await obj.fetch(request.url);
  let count = await resp.text();

  return new Response("Durable Object 'A' count: " + count);
}

// Durable Object

export class Counter {
  constructor(state, env) {
    this.state = state;
  }

  // Handle HTTP requests from clients.
  async fetch(request) {
    // Apply requested action.
    let url = new URL(request.url);
    let value = await this.state.storage.get("value") || 0;
    switch (url.pathname) {
    case "/increment":
      ++value;
      await this.state.storage.put("value", value);
      break;
    case "/decrement":
      --value;
      await this.state.storage.put("value", value);
      break;
    case "/":
      // Just serve the current value.
      break;
    default:
      return new Response("Not found", {status: 404});
    }

    return new Response(value);
  }
}
