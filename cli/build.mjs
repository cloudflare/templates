import PACKAGE from "./package.json" assert { type: "json" };
import * as esbuild from "esbuild";
import fs from "node:fs";

const outfile = PACKAGE["bin"];

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  sourcemap: true,
  platform: "node",
  outfile,
});

fs.writeFileSync(outfile, "#!/usr/bin/env node\n" + fs.readFileSync(outfile));
