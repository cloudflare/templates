# Agent instructions

This is a [Bounda](https://bounda.dev) app: event sourcing and CQRS for TypeScript. Business logic
lives in small modules under `app/`, and a file's folder and name are its declaration.

- **Read the docs of the installed version before writing a module; do not guess the API.** They
  are in `node_modules/@bounda-dev/core/docs/`: start at `README.md`, then
  `getting-started/core-concepts.md`, and `reference/conventions.md` for what every kind of file
  exports; `guides/project-layout.md` and `guides/read-models.md` show each one with an
  example.
- Every module imports its argument types from `./+types/<same file name>`. Run the `generate`
  script after adding, renaming or deleting a module. Never edit `.bounda/` or a `+types/`
  directory: both are generated.
- Test through commands and queries, as `tests/` does, and run the `test` script.
