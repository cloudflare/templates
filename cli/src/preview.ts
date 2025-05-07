import { collectTemplateFiles, getTemplates, SeedRepo } from "./util";
import fs from "node:fs";

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
    await commentOnPR(config, previewLinkBody(config));
  } catch (err) {
    await commentOnPR(
      config,
      ["Could not create preview:", (err as Error).message].join("\n"),
    );
  }
}

async function uploadPreview({
  templateDirectory,
  prId,
  seedRepo,
  api,
}: PreviewConfig) {
  const files = fs.readdirSync('.');
  console.log('cwd', process.cwd());
  console.log('current directory', files);
  const templates = getTemplates(templateDirectory);
  const body = templates.reduce((formData, { name, path: templatePath }) => {
    for (const file of collectTemplateFiles(templatePath)) {
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
  if (!response.ok) {
    const json: any = await response.json();
    if (Array.isArray(json.errors) && json.errors[0]?.message) {
      throw new Error(json.errors[0]?.message);
    }
    throw new Error(`Error response from ${api.endpoint} (${response.status})`);
  }
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
      `Error response from GitHub API (${response.status}): ${await response.text()}`,
    );
  }
}

function previewLinkBody(config: PreviewConfig) {
  const url = new URL("https://dash.cloudflare.com");
  url.searchParams.set(
    "to",
    `/:account/workers-and-pages/templates?preview_pr=${config.prId}`,
  );
  return `[Dashboard preview link](${url})`;
}
