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
  .action((templateDirectory: string) =>
    upload({ templateDirectory, apiBaseUrl: "TODO" }),
  );

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
