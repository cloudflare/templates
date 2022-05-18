// @ts-ignore
import indexHtml from './public/index.html';

declare global {
  var MINIFLARE: boolean;
}

type Environment = {
  DO_WORDLE: DurableObjectNamespace;
};

export { WordleDurableObject } from './durable-object';

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);

    let gameId;
    if (url.pathname.startsWith('/g/')) {
      // game id from a game name
      gameId = env.DO_WORDLE.idFromName(url.pathname).toString();
    } else {
      // game id from url
      gameId =
        url.pathname.substring(1) ||
        (globalThis.MINIFLARE && env.DO_WORDLE.newUniqueId().toString());
    }

    // redirect to a new Wordle game ID for /new
    if (gameId == 'new' || !gameId) {
      return Response.redirect(
        `${url.protocol}//${url.hostname}:${url.port}/${env.DO_WORDLE.newUniqueId().toString()}`
      );
    }

    // pass the request to Durable Object for game ID
    if (request.headers.get('upgrade') === 'websocket') {
      const doStub = env.DO_WORDLE.get(env.DO_WORDLE.idFromString(gameId));
      return doStub.fetch(request);
    }

    return new Response(indexHtml, {
      headers: { 'content-type': 'text/html' },
    });
  },
};
