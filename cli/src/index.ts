#! /usr/bin/env node

import { Command } from "@commander-js/extra-typings";
import { upload } from "./upload";
import { lint } from "./lint";
import { generateNpmLockfiles, lintNpmLockfiles } from "./npm";
import { preview } from "./preview";
import { validateLiveDemoLinks } from "./validateLiveDemoLinks";
import { actionWithSummary } from "./util";
import { validateD2CButtons } from "./validateD2CButtons";
import { setupHooks } from "./setupHooks";
import { depsInfo } from "./depsInfo";

const program = new Command();

program.name("cli").description("a handy CLI for developing templates");

program
  .command("upload")
  .description("upload templates to the templates API")
  .argument(
    "[path-to-template(s)]",
    "path to directory containing template(s)",
    ".",
  )
  .option("--staging", "use the staging API endpoint")
  .requiredOption("--repoFullName <string>", "the owner/repo combination")
  .requiredOption("--branch <string>", "the branch or ref")
  .action((templateDirectory, options) => {
    const clientId = process.env.TEMPLATES_API_CLIENT_ID;
    const clientSecret = process.env.TEMPLATES_API_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        `Missing TEMPLATES_API_CLIENT_ID or TEMPLATES_API_CLIENT_SECRET`,
      );
    }
    const subdomain = options.staging
      ? "integrations-platform-staging"
      : "integrations-platform";
    const [owner, repository] = options.repoFullName.split("/");
    return actionWithSummary("Upload", () =>
      upload({
        templateDirectory,
        seedRepo: {
          provider: "github",
          owner,
          repository,
          branch: options.branch,
        },
        api: {
          endpoint: `https://${subdomain}.cfdata.org/api/v1/templates`,
          clientId,
          clientSecret,
        },
      }),
    );
  });

program
  .command("lint")
  .description("find and fix template style problems")
  .argument(
    "[path-to-template(s)]",
    "path to directory containing template(s)",
    ".",
  )
  .option("--fix", "fix problems that can be automatically fixed")
  .action((templateDirectory, options) => {
    return actionWithSummary("Lint", () =>
      lint({ templateDirectory, fix: options.fix ?? false }),
    );
  });

program
  .command("generate-npm-lockfiles")
  .description("Generate npm lockfiles to improve install time of templates")
  .action(() => {
    return actionWithSummary("Generate npm lockfiles", () =>
      generateNpmLockfiles(),
    );
  });

program
  .command("lint-npm-lockfiles")
  .description("Lint all templates to ensure npm lockfiles are up to date")
  .action(() => {
    return actionWithSummary("Lint npm lockfiles", () => lintNpmLockfiles());
  });

program
  .command("validate-live-demo-links")
  .description("Ensures every template has a live demo that returns a 200")
  .argument(
    "[path-to-template(s)]",
    "path to directory containing template(s)",
    ".",
  )
  .action((templateDirectory) => {
    return actionWithSummary("Validate live demo links", () =>
      validateLiveDemoLinks({ templateDirectory }),
    );
  });

program
  .command("validate-d2c-buttons")
  .description(
    "Ensures every template has a Deploy to Cloudflare button in the readme",
  )
  .argument(
    "[path-to-template(s)]",
    "path to directory containing template(s)",
    ".",
  )
  .action((templateDirectory) => {
    return actionWithSummary("Validate Deploy to Cloudflare buttons", () =>
      validateD2CButtons({ templateDirectory }),
    );
  });

program
  .command("preview")
  .description("Generates a preview for the templates in a PR")
  .argument(
    "<path-to-templates>",
    "path to directory containing preview templates",
  )
  .option("--staging", "use the staging API endpoint")
  .requiredOption("--repoFullName <string>", "the owner/repo combination")
  .requiredOption("--branch <string>", "the branch or ref")
  .requiredOption("--pr <string>", "the ID of the pull request")
  .action((templateDirectory, options) => {
    const clientId = process.env.TEMPLATES_API_CLIENT_ID;
    const clientSecret = process.env.TEMPLATES_API_CLIENT_SECRET;
    const githubToken = process.env.GITHUB_TOKEN;
    if (!clientId || !clientSecret) {
      throw new Error(
        `Missing TEMPLATES_API_CLIENT_ID or TEMPLATES_API_CLIENT_SECRET`,
      );
    }
    if (!githubToken) {
      throw new Error("Missing GITHUB_TOKEN");
    }
    const subdomain = options.staging
      ? "integrations-platform-staging"
      : "integrations-platform";
    const [owner, repository] = options.repoFullName.split("/");
    return actionWithSummary("Preview", () =>
      preview({
        templateDirectory,
        prId: options.pr,
        githubToken,
        seedRepo: {
          provider: "github",
          owner,
          repository,
          branch: options.branch,
        },
        api: {
          endpoint: `https://${subdomain}.cfdata.org/api/v1/template-previews`,
          clientId,
          clientSecret,
        },
      }),
    );
  });

program
  .command("deps-info")
  .description(
    "Lists out version info for dependencies that have been added or modified",
  )
  .requiredOption("--pr <string>", "the ID of the pull request")
  .action((options) => {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error("Missing GITHUB_TOKEN");
    }
    return actionWithSummary("Deps Info", () =>
      depsInfo({
        prId: options.pr,
        githubToken,
      }),
    );
  });

program
  .command("setup-hooks")
  .description("sets up git hooks")
  .action(() => {
    setupHooks();
  });

program.parseAsync();
