type GetLoadContextArgs = {
  request: Request;
  context: {
    cloudflare: {
      env: Env;
      caches: CacheStorage;
      cf: Request["cf"];
      ctx: ExecutionContext;
    };
  };
};

declare module "react-router" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface AppLoadContext extends ReturnType<typeof getLoadContext> {
    // This will merge the result of `getLoadContext` into the `AppLoadContext`
  }
}

export function getLoadContext({ context }: GetLoadContextArgs) {
  return context;
}
