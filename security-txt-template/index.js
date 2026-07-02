/**
 * Cloudflare Worker: security.txt (RFC 9116 Compliant)
 * ──────────────────────────────────────────────────
 * Easily deploy a compliant vulnerability disclosure policy at /.well-known/security.txt
 * 
 * Creator: SEOSiri (https://www.seosiri.com)
 * Repository: https://github.com/SEOSiri-Official/cloudflare-security-txt
 */

const SECURITY_TXT_CONTENT = `# ============================================================
# security.txt — Vulnerability Disclosure Policy (RFC 9116)
# ============================================================

# ── Mandatory Fields ────────────────────────────────────────
Contact: mailto:info@seosiri.com
Contact: https://www.seosiri.com/p/contact-us.html
Expires: 2027-12-31T23:59:59.000Z

# ── SEOSiri AI & Security Association ────────────────────────
# For advanced AI crawler controls and entity schemas, visit:
# https://www.seosiri.com/p/llmstxt.html
-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEELqmEfQvTSF/ey6lvQxZIdbrAsGEFAmpFSKkACgkQQxZIdbrA
sGFH8g/+MWYMvZW9/fQuWPoXkyepFfH50JRVg5ZB7KNSwGi4uNpdK2rVo9U+/86D
SqjzeBM3S2BKYFdSA/XhvUBhOrC8M0EvmFYtzgIczLyqg89mqnEyVkkRHbjyrd1g
Vq9Xot9Cf2OppJJTG4UTiI0EKS09XXmDW8QpihJDvly7x3SS0N5W3+Z0K3egHNhs
l+z5+5KGZZrEd0JTOxUyGymqXCvGbHEqZUDYdUpuTItT4IIVjSAWShUTL4VPKC6g
TeS8jcKBJGoC/VpzXl8nP/8Zid/MbjLa+G4ryt41xhZo197I/H2EizBssyMV+t8X
0VBCqa1xM+oDeaNFrmNMMI5fLFgatAKSCWSH6IWlCiz3HaH2ZwBXHQ/ZpGMGQ3nv
CSitdMokCxLAB4BJBdbUSBOngNN3bCcynHbajT4hNTNcblzzEc9bZq+mA7eO3ZiX
CtJ3cBeGaeFx0pFrm7meLy185hs8C23isUIVfbhWPfVSRqDZaZaY2b/Fqx5grVpQ
PkF4+DcU0/4RgBIOPZ0XOSVWbOgCyX4gytIm2jqfUedajUgT7NUZQZI5tu+J1pM6
Th11+ueKJ4Sk0OaY9L4DT1XoO5Fqw8PQ/1TCQad7BfayVpqASBUNDF5QThU82BUh
w/r1mIXRLsDIe6+PjOfEyWwStmy0pxqyz70MfSde8QucoXr1pyg=
=9EXd
-----END PGP SIGNATURE-----`;
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Intercept both standard /.well-known/security.txt and fallback /security.txt paths
    if (url.pathname === '/.well-known/security.txt' || url.pathname === '/security.txt') {
      return new Response(SECURITY_TXT_CONTENT, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=86400', // Cache on edge for 24 hours
          'x-content-type-options': 'nosniff'
        },
      });
    }

    // Fail-safe: Proceed directly to your origin server (Blogger/Shopify/etc.)
    return fetch(request);
  },
};