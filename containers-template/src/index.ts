import { Container, loadBalance, getContainer } from "@cloudflare/containers";

export class MyContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
  envVars = {
    MESSAGE: "I was passed in via the container class!",
  };

  override onStart() {
    console.log("Container successfully started");
  }

  override onStop() {
    console.log("Container successfully shut down");
  }

  override onError(error: unknown) {
    console.log("Container error:", error);
  }
}

export default {
  async fetch(
    request: Request,
    env: { MY_CONTAINER: DurableObjectNamespace<MyContainer> },
  ): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    // To route requests to a specific container,
    // pass a unique container identifier to .get()
    if (pathname.startsWith("/container")) {
      let id = env.MY_CONTAINER.idFromName(pathname);
      let container = env.MY_CONTAINER.get(id);
      return await container.fetch(request);
    }

    // This route forces a panic in the container.
    // This will cause the onError hook to run
    if (pathname.startsWith("/error")) {
      let container = getContainer(env.MY_CONTAINER, "error-test");
      return await container.fetch(request);
    }

    // This route uses the loadBalance helper to route
    // requests to one of 3 containers
    if (pathname.startsWith("/lb")) {
      let container = await loadBalance(env.MY_CONTAINER, 3);
      return await container.fetch(request);
    }

    // This route uses the getContainer helper to get a
    // single contianer instance and always routes to it
    if (pathname.startsWith("/singleton")) {
      return await getContainer(env.MY_CONTAINER).fetch(request);
    }

    return new Response(
      "Call /container/<ID> to start a container for each ID with a 2m timeout.\nCall /lb to load balancing over multiple containers\nCall /error to start a container that errors\nCall /singleton to get a single specific container",
    );
  },
};
