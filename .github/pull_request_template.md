# Description

Fixes #[insert GH or internal issue link(s)].

# Checklist

<!--
Please don't delete the checkboxes <3
The following selections do not need to be completed if this PR only contains changes to .md files
-->

- Template Metadata
  - [ ] template directory ends with `-template`
  - [ ] "cloudflare" section of `package.json` is populated
  - [ ] template preview image uploaded to Images
  - [ ] README is populated and uses `<!-- dash-content-start -->` and `<!-- dash-content-end -->` to designate the Dash readme preview
  - [ ] `.gitignore` file exists
  - [ ] `package.json` contains a `deploy` command
  - [ ] `package.json` contains `private: true` and no `version` field

## Example `package.json`

```json
"private": true,
"cloudflare": {
  "label": "Worker + D1 Database",
  "products": [
    "Workers",
    "D1"
  ],
  "categories": [
    "storage"
  ],
  "docs_url": "https://developers.cloudflare.com/d1/",
  "preview_image_url": "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/cb7cb0a9-6102-4822-633c-b76b7bb25900/public"
}
```

<!--
Have you read our [Contributing guide](https://github.com/cloudflare/workers-sdk/blob/main/CONTRIBUTING.md)?
In particular, for non-trivial changes, please always engage on the issue or create a discussion or feature request issue first before writing your code.
-->
