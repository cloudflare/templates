# Template: Upload a video to Cloudflare Stream using TUS

Example of uploading a video to Cloudflare Stream using the TUS protocol.

Refer to (Resumable uploads with TUS)[https://developers.cloudflare.com/stream/uploading-videos/upload-video-file/#resumable-uploads-with-tus-for-large-files] in the developer docs for more details.

### Setup

1. Edit the values for `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.env`. Your Cloudflare API Token should never be committed to git or exposed in client javascript.
2. Run `node index.js` to upload the `default.mp4` video file to your Cloudflare Stream account.