import Cloudflare from "cloudflare";
import { toFile } from "cloudflare/index";

const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";
const accountID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";

if (!apiToken) throw new Error("Please set env var CLOUDFLARE_API_TOKEN");
if (!accountID) throw new Error("Please set env var CLOUDFLARE_ACCOUNT_ID");

const cf = new Cloudflare({ apiToken });

// Deploy a code snippet into a Workers for Platforms dispatch namespace
export async function deploySnippetToNamespace(opts: {
	namespaceName: string;
	scriptName: string;
	code: string; // ES module Worker code
	bindings?: Array<
		| { type: "plain_text"; name: string; text: string }
		| { type: "kv_namespace"; name: string; namespace_id: string }
		| { type: "r2_bucket"; name: string; bucket_name: string }
		// add other binding types as needed
	>;
}) {
	const { namespaceName, scriptName, code, bindings = [] } = opts;

	// 1) Ensure dispatch namespace exists (create if missing)
	let ns = null as null | { namespace_name?: string };
	try {
		ns = await cf.workersForPlatforms.dispatch.namespaces.get(namespaceName, {
			account_id: accountID,
		});
	} catch {
		ns = await cf.workersForPlatforms.dispatch.namespaces.create({
			account_id: accountID,
			name: namespaceName,
		});
	}

	const moduleFileName = `${scriptName}.mjs`;

	// 2) Upload as a module worker into the namespace
	await cf.workersForPlatforms.dispatch.namespaces.scripts.update(
		namespaceName,
		scriptName,
		{
			account_id: accountID,
			metadata: {
				main_module: moduleFileName,
				bindings,
			},
			files: {
				[moduleFileName]: await toFile(Buffer.from(code), moduleFileName, {
					type: "application/javascript+module",
				}),
			},
		},
	);

	return {
		namespace: namespaceName,
		script: scriptName,
	};
}

// --- Example usage ---
if (require.main === module) {
	const code = `
    export default {
      async fetch(req, env) {
        return new Response(env.MESSAGE ?? "Hello from WfP!", { status: 200 });
      }
    };
  `;

	deploySnippetToNamespace({
		namespaceName: "my-dispatch-namespace",
		scriptName: "my-hello-world-script",
		code,
		bindings: [{ type: "plain_text", name: "MESSAGE", text: "Hello World!" }],
	})
		.then((res) => {
			console.log("Deployed:", res);
			console.log(
				"Call it from your dynamic dispatch worker with namespace binding.",
			);
		})
		.catch((err) => {
			console.error("Deploy failed:", err);
			process.exit(1);
		});
}
