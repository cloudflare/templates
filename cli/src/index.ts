import { Command } from "commander";
import { upload } from "./upload";

const program = new Command();

program.name("cli").description("A handy CLI for developing templates.");

program
  .command("upload")
  .argument(
    "[path-to-templates]",
    "path to directory containing templates",
    ".",
  )
  .action((templateDirectory) =>
    upload({ templateDirectory, apiBaseUrl: "TODO" }),
  );

program.parse();
