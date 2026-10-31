// Eden Treaty wired to the actions mount (/_brust/action). `import type` is erased, so no Elysia reaches the browser.
import { client } from "@brust/core/client";
import type { App } from "../actions";

export const api = client<App>();
