// The official Deploy to Cloudflare button: it clones this template into your GitHub account and deploys it.
export const DEPLOY_URL =
	"https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/brust-template";

export default function DeployButton() {
	return (
		<a
			className="inline-block rounded focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-ink"
			href={DEPLOY_URL}
		>
			<img
				className="block"
				src="https://deploy.workers.cloudflare.com/button"
				alt="Deploy to Cloudflare"
				height="32"
			/>
		</a>
	);
}
