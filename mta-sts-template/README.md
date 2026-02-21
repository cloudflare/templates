# MTA-STS Cloudflare worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/mta-sts-template)

<!-- dash-content-start -->

This is a [mta-sts](todo) worker, it satisfies the web part of RFC 8461, note that the DNS part is your responsibility.

<!-- dash-content-end -->

When deploying this worker you add it as a custom sub-domain named `mta-sts` under the domain you want to enable MTA-STS for.

After ensuring it works and is publishing the correct content you need to add a TXT DNS record at `_mta-sts` with a value of this format `"v=STSv1; id=20260220T211000;"`.
