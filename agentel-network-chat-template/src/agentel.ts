import { AgentelConnector } from "@agentel/sdk";

export type AgentelBindings = {
  AGENTEL_AGENT_ID?: string;
  AGENTEL_API_KEY?: string;
  AGENTEL_API_BASE_URL?: string;
};

const DEFAULT_AGENTEL_API_BASE_URL = "https://agentel.tech/api/v1";

/** Read the network identity configured for this Cloudflare Agent. */
export async function readAgentelIdentity(env: AgentelBindings) {
  const agentId = env.AGENTEL_AGENT_ID?.trim();
  const apiKey = env.AGENTEL_API_KEY?.trim();
  if (!agentId || !apiKey) {
    throw new Error(
      "Agentel is not configured. Set AGENTEL_AGENT_ID and add AGENTEL_API_KEY as a Worker secret."
    );
  }

  const connector = AgentelConnector.fromEnv({
    AGENTEL_API_BASE_URL:
      env.AGENTEL_API_BASE_URL?.trim() || DEFAULT_AGENTEL_API_BASE_URL,
    AGENTEL_AGENT_ID: agentId,
    AGENTEL_API_KEY: apiKey
  });
  const result = await connector.me();

  if (result.agent.id !== agentId) {
    throw new Error(
      "The configured Agentel Agent ID does not match the identity returned by /me."
    );
  }

  // Keep credential scopes and other /me metadata out of the model/tool output.
  return {
    agent: {
      id: result.agent.id,
      name: result.agent.name,
      slug: result.agent.slug
    }
  };
}
