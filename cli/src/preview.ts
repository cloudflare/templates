import {
  collectTemplateFiles,
  getTemplates,
  handleCloudflareResponse,
  SeedRepo,
} from "./util";
import fs from "node:fs";
import MarkdownError from "./MarkdownError";

export type PreviewConfig = {
  templateDirectory: string;
  prId: string;
  githubToken: string;
  seedRepo: SeedRepo;
  api: {
    endpoint: string;
    clientId: string;
    clientSecret: string;
  };
};
export async function preview(config: PreviewConfig) {
  try {
    await uploadPreview(config);
    return commentOnPR(config, previewLinkBody(config));
  } catch (err) {
    throw new MarkdownError(
      "Could not create preview.",
      (err as Error).message,
    );
  }
}

async function uploadPreview({
  templateDirectory,
  prId,
  seedRepo,
  api,
}: PreviewConfig) {
  const templates = getTemplates(templateDirectory);
  const body = templates.reduce((formData, { name, path: templatePath }) => {
    for (const file of collectTemplateFiles(templatePath, !!seedRepo)) {
      formData.set(path.join(name, file.name), file);
    }
    return formData;
  }, new FormData());
  const queryParams = new URLSearchParams({ ...seedRepo, pr_id: prId });
  const response = await fetch(`${api.endpoint}?${queryParams}`, {
    method: "POST",
    headers: {
      "Cf-Access-Client-Id": api.clientId,
      "Cf-Access-Client-Secret": api.clientSecret,
    },
    body,
  });
  return handleCloudflareResponse(response);
}

async function commentOnPR({ prId, githubToken }: PreviewConfig, body: string) {
  const response = await fetch(
    `  https://api.github.com/repos/cloudflare/templates/issues/${prId}/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${githubToken}`,
      },
      body: JSON.stringify({
        body,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Error response from GitHub (${response.status}): ${await response.text()}`,
    );
  }
  return body;
}

function previewLinkBody(config: PreviewConfig) {
  const url = new URL("https://dash.cloudflare.com");
  url.searchParams.set(
    "to",
    `/:account/workers-and-pages/template-preview/${config.prId}`,
  );
  return `[Dashboard preview link](${url})`;
}
