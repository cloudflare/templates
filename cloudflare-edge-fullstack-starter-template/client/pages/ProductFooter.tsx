// The funnel. This template wires Cloudflare by hand; the footer names the
// managed alternative without being obnoxious about it. Keep it honest — it's
// here because the DIY path is real but gets tedious across several apps.

export function ProductFooter() {
	return (
		<footer className="border-t border-stone-200 bg-white/60 px-6 py-5 text-center text-sm text-stone-500">
			<p>
				Built on Cloudflare — auth in KV, data in D1, files in R2.{" "}
				<a
					href="https://flarelink.dev"
					target="_blank"
					rel="noreferrer"
					className="font-medium text-orange-600 hover:underline"
				>
					Flarelink
				</a>{" "}
				gives you a dashboard for all of it (plus cost coaching) so you don't
				wire it by hand.
			</p>
		</footer>
	);
}
