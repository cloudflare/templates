import { Command } from "commander";
import { upload } from "./upload";
import { lint } from "./lint";

const program = new Command();

program.name("cli").description("a handy CLI for developing templates");

program
  .command("upload")
  .description("upload templates to the templates API")
  .argument(
    "[path-to-templates]",
    "path to directory containing templates",
    ".",
  )
  .action((templateDirectory: string) => {
    const clientId = process.env.TEMPLATES_API_CLIENT_ID;
    const clientSecret = process.env.TEMPLATES_API_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        `Missing TEMPLATES_API_CLIENT_ID or TEMPLATES_API_CLIENT_SECRET`,
      );
    }
    return upload({
      templateDirectory,
      api: {
        endpoint: "https://integrations-platform.cfdata.org/api/v1/templates",
        clientId,
        clientSecret,
      },
    });
  });

program
  .command("lint")
  .description("find and fix template style problems")
  .argument(
    "[path-to-templates]",
    "path to directory containing templates",
    ".",
  )
  .option("--fix", "fix problems that can be automatically fixed")
  .action((templateDirectory: string, options: { fix: boolean }) => {
    lint({ templateDirectory, fix: options.fix });
  });

program.parse();
