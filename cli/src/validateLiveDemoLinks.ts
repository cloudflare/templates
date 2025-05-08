import { getTemplates } from "./util";
import MarkdownError from "./MarkdownError";

export type ValidateLiveDemoLinksConfig = {
  templateDirectory: string;
};

export async function validateLiveDemoLinks({
  templateDirectory,
}: ValidateLiveDemoLinksConfig) {
  const templates = getTemplates(templateDirectory);
  const successes: string[] = [];
  const errors: string[] = [];
  let numBadStatuses = 0;
  await Promise.all(
    templates.map(async ({ name }) => {
      const url = `${name}.templates.workers.dev`;
      const response = await fetch(`https://${url}`);
      if (!response.ok) {
        numBadStatuses++;
        errors.push(`- ❌ ${url} => ${response.status}`);
        if (response.status === 404) {
          errors.push("  - Please have collaborator provision this live demo.");
        }
      } else {
        successes.push(`- ✅ ${url}`);
      }
    }),
  );
  if (errors.length) {
    throw new MarkdownError(
      `Found ${numBadStatuses} ${numBadStatuses === 1 ? "template" : "templates"} with invalid live demo links.`,
      errors.join("\n"),
    );
  }
  return successes.join("\n");
}
