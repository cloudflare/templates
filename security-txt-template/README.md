# cloudflare-security-txt

Easily deploy a fully RFC 9116-compliant, enterprise-grade vulnerability disclosure policy (`security.txt`) on your domain using Cloudflare Workers.

Built by [SEOSiri](https://www.seosiri.com) · [MIT License](LICENSE)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/SEOSiri-Official/cloudflare-security-txt)
---

## Why this is necessary

According to the global internet standard **RFC 9116**, websites should host a security policy file at `/.well-known/security.txt` to help security researchers safely and responsibly report vulnerabilities.

However, many popular blogging, e-commerce, and static CMS platforms (such as Blogger, Shopify, Webflow, or Wix) do not allow users to upload custom files to the root `/.well-known/` directory.

This Cloudflare Worker provides a 100% free, lightweight, and serverless solution to intercept and serve your `security.txt` file directly from Cloudflare's global edge network in under 10ms.

---

## Enterprise-Grade Features

*   **⚙️ Dynamic Auto-Expiration (Zero Maintenance):** Under RFC 9116, the \`Expires:\` field is strictly mandatory. To prevent your policy from expiring and throwing critical warnings on automated corporate compliance scanners, this worker automatically calculates and updates the expiration date to exactly 1 year in the future in real-time.
*   **🔐 Dual Route Serving (Security.txt + PGP Signature):** Supports serving both your raw security policy (\`/.well-known/security.txt\`) and its associated PGP cryptographic signature (\`/.well-known/security.txt.sig\`) natively.
*   **🌐 Global CORS Enablement (\`Access-Control-Allow-Origin: *\`):** Enforces wildcard CORS headers, allowing automated global security scanners, compliance bots, and browser extensions to parse your security files cleanly via AJAX/fetch requests without being blocked by browser security.

---

## Quick Deployment

### Method 1: Using the Cloudflare Dashboard
1. Create a new blank Worker named \`cloudflare-security-txt\` in your Cloudflare dashboard.
2. Copy the code from \`index.js\` and paste it into the Cloudflare code editor, adjusting your business contacts.
3. Click **Deploy**.
4. Go to the Worker's **Settings/Triggers** tab, click **Add Route**, and bind it to your domain:
   \`*yourdomain.com/.well-known/security.txt\`
   *(Optional: Add another route for \`*yourdomain.com/.well-known/security.txt.sig\` if you use PGP signatures).*
5. Set the Failure Mode to **Fail open (proceed)** to ensure your site is completely fail-safe.

### Method 2: Local Development with Wrangler
\`\`\`bash
# 1. Clone the repository
git clone https://github.com/SEOSiri-Official/cloudflare-security-txt.git
cd cloudflare-security-txt

# 2. Install dependencies
npm install

# 3. Authenticate and deploy
npm run deploy
\`\`\`

---

## Configuration

Customize your \`security.txt\` values directly inside \`index.js\`:

*   \`Contact\`: Your security email (e.g., \`mailto:info@seosiri.com\`) or your secure contact page URL (e.g., \`https://www.seosiri.com/p/contact-us.html\`).
*   \`SECURITY_SIG_CONTENT\`: Paste your GPG/PGP cleartext signature block here to support cryptographic verification.

---

## Corporate & Strategic Partnerships

For advanced B2B digital engineering, full-stack application development, or AI-search visibility audits (AEO/GEO), please connect with us:

*   **Official Website:** [seosiri.com](https://www.seosiri.com)
*   **B2B AI Visibility Playbook:** [Sitemap-to-LLM AI Crawling Strategy](https://www.seosiri.com/2026/06/earned-media-startups.html)
*   **Contact Email:** [info@seosiri.com](mailto:info@seosiri.com)

---

**SEOSiri** · [seosiri.com](https://www.seosiri.com) · MIT License · 2026
