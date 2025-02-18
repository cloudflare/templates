# Description

Fixes #[insert GH or internal issue link(s)].

# Checklist

<!--
Please don't delete the checkboxes <3
The following selections do not need to be completed if this PR only contains changes to .md files
-->

- Template Metadata
  - [ ] "cloudflare" section of package.json is populated
  - [ ] template preview image uploaded to Images
  - [ ] README is populated and uses `<!-- dash-content-start -->` and `<!-- dash-content-end -->` to designate the Dash readme preview

## Example package.json

```json
"cloudflare": {
  "label": "Worker + D1 Database",
  "products": [
    "Workers",
    "D1"
  ],
  "categories": [
    "storage"
  ],
  "icon_urls": [
    "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/c6fc5da3-1e0a-4608-b2f1-9628577ec800/public",
    "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/5ca0ca32-e897-4699-d4c1-6b680512f000/public"
  ],
  "docs_url": "https://developers.cloudflare.com/d1/",
  "preview_image_url": "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/cb7cb0a9-6102-4822-633c-b76b7bb25900/public"
}
```

<!--
Have you read our [Contributing guide](https://github.com/cloudflare/workers-sdk/blob/main/CONTRIBUTING.md)?
In particular, for non-trivial changes, please always engage on the issue or create a discussion or feature request issue first before writing your code.
-->
