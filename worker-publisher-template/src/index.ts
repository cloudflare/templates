import Cloudflare from "cloudflare";

// Deploy function (copied from deploy-wfp.ts)
async function deploySnippetToNamespace(
	opts: {
		namespaceName: string;
		scriptName: string;
		code: string;
		bindings?: Array<
			| { type: "plain_text"; name: string; text: string }
			| { type: "kv_namespace"; name: string; namespace_id: string }
			| { type: "r2_bucket"; name: string; bucket_name: string }
		>;
	},
	env: {
		CLOUDFLARE_API_TOKEN: string;
		CLOUDFLARE_ACCOUNT_ID: string;
	},
) {
	const { namespaceName, scriptName, code, bindings = [] } = opts;

	const cf = new Cloudflare({
		apiToken: env.CLOUDFLARE_API_TOKEN,
	});

	// Ensure dispatch namespace exists
	try {
		await cf.workersForPlatforms.dispatch.namespaces.get(namespaceName, {
			account_id: env.CLOUDFLARE_ACCOUNT_ID,
		});
	} catch {
		await cf.workersForPlatforms.dispatch.namespaces.create({
			account_id: env.CLOUDFLARE_ACCOUNT_ID,
			name: namespaceName,
		});
	}

	const moduleFileName = `${scriptName}.mjs`;

	// Upload worker to namespace
	await cf.workersForPlatforms.dispatch.namespaces.scripts.update(
		namespaceName,
		scriptName,
		{
			account_id: env.CLOUDFLARE_ACCOUNT_ID,
			metadata: {
				main_module: moduleFileName,
				bindings,
			},
			files: {
				[moduleFileName]: new File([code], moduleFileName, {
					type: "application/javascript+module",
				}),
			},
		},
	);

	return { namespace: namespaceName, script: scriptName };
}

const HTML_UI = ({ isReadOnly }: { isReadOnly: boolean }) => `<!DOCTYPE html>
<html>
<head>
  <title>Worker Publisher</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>&#x1F680;</text></svg>">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #fef7ed;
      color: #1a1a1a;
      line-height: 1.6;
      padding: 20px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    h1 {
      font-size: 3rem;
      font-weight: 900;
      color: #1a1a1a;
      text-shadow: 4px 4px 0px #fb923c;
      margin-bottom: 2rem;
      text-transform: uppercase;
      letter-spacing: -0.02em;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      font-weight: 700;
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
      color: #1a1a1a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    input, textarea {
      width: 100%;
      padding: 1rem;
      border: 4px solid #1a1a1a;
      background: white;
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 1rem;
      box-shadow: 8px 8px 0px #fb923c;
      transition: all 0.1s ease;
    }

    input:focus, textarea:focus {
      outline: none;
      transform: translate(-2px, -2px);
      box-shadow: 12px 12px 0px #fb923c;
    }

    textarea {
      height: 300px;
      resize: vertical;
    }

    button {
      background: #fb923c;
      color: #1a1a1a;
      border: 4px solid #1a1a1a;
      padding: 1rem 2rem;
      font-weight: 900;
      font-size: 1.1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      box-shadow: 8px 8px 0px #1a1a1a;
      transition: all 0.1s ease;
      font-family: inherit;
    }

    button:hover {
      transform: translate(-2px, -2px);
      box-shadow: 12px 12px 0px #1a1a1a;
    }

    button:active {
      transform: translate(2px, 2px);
      box-shadow: 4px 4px 0px #1a1a1a;
    }

    button:disabled {
      background: #9ca3af;
      color: #6b7280;
      cursor: not-allowed;
      box-shadow: 4px 4px 0px #6b7280;
    }

    button:disabled:hover {
      transform: none;
      box-shadow: 4px 4px 0px #6b7280;
    }

    .result {
      margin-top: 2rem;
      padding: 1.5rem;
      border: 4px solid #1a1a1a;
      background: white;
      box-shadow: 8px 8px 0px #fb923c;
      font-weight: 600;
    }

    .result.success {
      background: #dcfce7;
      border-color: #166534;
      box-shadow: 8px 8px 0px #22c55e;
    }

    .result.error {
      background: #fef2f2;
      border-color: #dc2626;
      box-shadow: 8px 8px 0px #ef4444;
    }

    .result a {
      color: #fb923c;
      font-weight: 900;
      text-decoration: none;
      border-bottom: 3px solid #fb923c;
    }

    .result a:hover {
      background: #fb923c;
      color: #1a1a1a;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Worker Publisher</h1>
    <form id="deployForm">
      <div class="form-group">
        <label for="scriptName">Script Name</label>
        <input type="text" id="scriptName" placeholder="my-worker" required>
      </div>
      <div class="form-group">
        <label for="code">Worker Code</label>
        <textarea id="code">export default {
  async fetch(request, env, ctx) {
    // Get worker name from URL path
    const url = new URL(request.url);
    const workerName = url.pathname.split('/')[1] || 'Your Worker';

    const html = '<!DOCTYPE html>' +
      '<html><head><meta charset="UTF-8">' +
      '<title>' + workerName + ' Deployed!</title>' +
      '<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%23fb923c%22/></svg>">' +
      '<style>* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif; background: #fef7ed; color: #1a1a1a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }' +
      '.container { text-align: center; max-width: 600px; }' +
      'h1 { font-size: 4rem; font-weight: 900; color: #1a1a1a; text-shadow: 6px 6px 0px #fb923c; margin-bottom: 2rem; text-transform: uppercase; letter-spacing: -0.02em; word-break: break-word; }' +
      '.deployed-badge { background: #fb923c; color: #1a1a1a; border: 4px solid #1a1a1a; padding: 1.5rem 3rem; font-weight: 900; font-size: 1.5rem; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 12px 12px 0px #1a1a1a; display: inline-block; margin-bottom: 3rem; transform: rotate(-2deg); }' +
      'p { font-size: 1.3rem; font-weight: 600; margin-bottom: 2rem; color: #374151; }' +
      '.success-emoji { font-size: 3rem; margin-bottom: 1rem; display: block; }' +
      '.deploy-more-btn { background: #22c55e; color: #1a1a1a; border: 4px solid #1a1a1a; padding: 1rem 2rem; font-weight: 900; font-size: 1.2rem; text-transform: uppercase; letter-spacing: 0.05em; text-decoration: none; display: inline-block; margin-top: 2rem; box-shadow: 8px 8px 0px #1a1a1a; transition: all 0.1s ease; transform: rotate(1deg); }' +
      '.deploy-more-btn:hover { transform: rotate(1deg) translate(-2px, -2px); box-shadow: 12px 12px 0px #1a1a1a; }' +
      '.deploy-more-btn:active { transform: rotate(1deg) translate(2px, 2px); box-shadow: 4px 4px 0px #1a1a1a; }' +
      '</style></head><body><div class="container">' +
      '<h1>' + workerName.toUpperCase() + '</h1>' +
      '<div class="deployed-badge">IS NOW DEPLOYED!</div>' +
      '<p>Your Cloudflare Worker is live and ready to serve the world!</p>' +
      '<a href="/" class="deploy-more-btn">DEPLOY MORE!</a>' +
      '</div></body></html>';

    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};</textarea>
      </div>
      <button type="submit"${isReadOnly ? " disabled" : ""}>Deploy Worker</button>
    </form>
    ${isReadOnly ? '<div class="result error">Deployment is disabled in read-only mode</div>' : ""}
    <div id="result"></div>
  </div>

  <script>
    const isReadOnly = ${isReadOnly};

    document.getElementById('deployForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const scriptName = document.getElementById('scriptName').value;
      const code = document.getElementById('code').value;
      const resultDiv = document.getElementById('result');

      resultDiv.innerHTML = '<div style="font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em;">Deploying...</div>';

      try {
        const response = await fetch('/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptName, code })
        });

        const result = await response.json();

        if (response.ok) {
          resultDiv.innerHTML = \`<div class="result success">Successfully deployed worker "\${result.script}"! Redirecting...</div>\`;
          // Redirect to the deployed worker after 2 seconds
          setTimeout(() => {
            window.location.href = '/' + result.script;
          }, 2000);
        } else {
          resultDiv.innerHTML = \`<div class="result error">Error: \${result.error}</div>\`;
        }
      } catch (error) {
        resultDiv.innerHTML = \`<div class="result error">Error: \${error.message}</div>\`;
      }
    });
  </script>
</body>
</html>`;

export default {
	async fetch(
		request: Request,
		env: {
			CLOUDFLARE_API_TOKEN: string;
			CLOUDFLARE_ACCOUNT_ID: string;
			DISPATCHER: any;
			READONLY: string | boolean;
		},
	) {
		const url = new URL(request.url);
		const pathSegments = url.pathname.split("/").filter(Boolean);
		const isReadOnly = env.READONLY === "true" || env.READONLY === true;

		// Handle UI route
		if (pathSegments.length === 0) {
			return new Response(HTML_UI({ isReadOnly }), {
				headers: { "Content-Type": "text/html" },
			});
		}

		// Handle deploy endpoint
		if (pathSegments[0] === "deploy" && request.method === "POST") {
			if (isReadOnly) {
				return new Response(
					JSON.stringify({ error: "Read-only mode enabled" }),
					{
						status: 403,
						headers: { "Content-Type": "application/json" },
					},
				);
			}
			try {
				const { scriptName, code } = await request.json();

				if (!scriptName || !code) {
					return new Response(
						JSON.stringify({ error: "Missing scriptName or code" }),
						{
							status: 400,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const result = await deploySnippetToNamespace(
					{
						namespaceName: "my-dispatch-namespace",
						scriptName,
						code,
					},
					env,
				);

				return new Response(JSON.stringify(result), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				return new Response(JSON.stringify({ error: error.message }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		// Handle worker dispatch (existing functionality)
		const workerName = pathSegments[0];

		try {
			const worker = env.DISPATCHER.get(workerName);
			return await worker.fetch(request);
		} catch (e) {
			if (e.message.startsWith("Worker not found")) {
				return new Response(`Worker '${workerName}' not found`, {
					status: 404,
				});
			}
			return new Response("Internal error", { status: 500 });
		}
	},
};
