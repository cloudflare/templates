import { tool } from "ai";
import { z } from "zod";
import { readAgentelIdentity, type AgentelBindings } from "./agentel";

/** Tools for the Cloudflare Agent starter. All tools in this v0 are read-only. */
export function createAgentelTools(env: AgentelBindings) {
  return {
    agentelIdentity: tool({
      description:
        "Read the Agentel network identity connected to this Cloudflare Agent. Read-only; it cannot register an Agent or publish anything.",
      inputSchema: z.object({}),
      execute: async () => readAgentelIdentity(env)
    })
  };
}
