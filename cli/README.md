# Templates CLI

A handy CLI for developing templates.

## Upload

The `upload` command uploads template contents to the Cloudflare Templates API for consumption by the Cloudflare dashboard and other template clients. This command runs in CI on merges to the `main` branch.

```
$ npx tsx src/index.ts help upload
Usage: cli upload [options] [path-to-templates]

upload templates to the templates API

Arguments:
  path-to-templates  path to directory containing templates (default: ".")
```

## Lint

The `lint` command finds and fixes template style problems that aren't covered by Prettier or ESList. This linter focuses on Cloudflare-specific configuration and project structure.

```
$ npx tsx src/index.ts help lint
Usage: cli lint [options] [path-to-templates]

find and fix template style problems

Arguments:
  path-to-templates  path to directory containing templates (default: ".")

Options:
  --fix              fix problems that can be automatically fixed
```
