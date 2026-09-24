type Status = {
	readonly name: string;
	readonly protocol: string;
	readonly localGrpcAddress: string;
	readonly containerPort: number;
	readonly path: readonly string[];
};

export function renderHomePage(status: Status): string {
	const stages = status.path
		.map(
			(stage, index) => `
        <li class="stage">
          <span class="stage-number">${index + 1}</span>
          <span>${stage}</span>
        </li>`,
		)
		.join("");

	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${status.name}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #070b14;
        color: #f8fafc;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 85% 5%, rgba(37, 99, 235, .24), transparent 34rem),
          radial-gradient(circle at 5% 95%, rgba(246, 130, 31, .14), transparent 30rem),
          #070b14;
      }
      main {
        width: min(1120px, calc(100% - 40px));
        margin: 0 auto;
        padding: 72px 0 64px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: #cbd5e1;
        font: 600 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: .11em;
        text-transform: uppercase;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 24px rgba(74, 222, 128, .8);
      }
      h1 {
        max-width: 850px;
        margin: 22px 0 18px;
        font-size: clamp(48px, 8vw, 86px);
        line-height: .98;
        letter-spacing: -.055em;
      }
      .lede {
        max-width: 760px;
        margin: 0;
        color: #94a3b8;
        font-size: clamp(18px, 2.5vw, 23px);
        line-height: 1.55;
      }
      .card {
        margin-top: 52px;
        padding: 30px;
        border: 1px solid #334155;
        border-radius: 26px;
        background: rgba(15, 23, 42, .82);
        box-shadow: 0 30px 80px rgba(2, 6, 23, .45);
        backdrop-filter: blur(18px);
      }
      .card-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 26px;
      }
      h2 { margin: 0; font-size: 21px; }
      .badge {
        padding: 9px 13px;
        border: 1px solid #475569;
        border-radius: 999px;
        color: #cbd5e1;
        background: #0f172a;
        font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .pipeline {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
        padding: 0;
        margin: 0;
        list-style: none;
      }
      .stage {
        position: relative;
        min-height: 128px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 20px;
        border: 1px solid #334155;
        border-radius: 18px;
        background: #111827;
        color: #e2e8f0;
        font-weight: 650;
        line-height: 1.35;
      }
      .stage:not(:last-child)::after {
        content: "→";
        position: absolute;
        z-index: 2;
        right: -22px;
        top: 47px;
        color: #fb923c;
        font-size: 26px;
      }
      .stage-number {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 11px;
        color: #ffedd5;
        background: #431407;
        border: 1px solid #9a3412;
        font: 700 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .terminal {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 16px;
        align-items: center;
        margin-top: 18px;
        padding: 18px 20px;
        border: 1px solid #334155;
        border-radius: 16px;
        background: #020617;
      }
      .prompt { color: #4ade80; font-weight: 800; }
      code {
        overflow-wrap: anywhere;
        color: #e2e8f0;
        font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .details {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
        margin-top: 18px;
      }
      .detail {
        padding: 18px 20px;
        border: 1px solid #253047;
        border-radius: 16px;
        background: rgba(15, 23, 42, .72);
      }
      .label {
        display: block;
        margin-bottom: 8px;
        color: #64748b;
        font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: .09em;
        text-transform: uppercase;
      }
      .value { color: #e2e8f0; font-size: 15px; font-weight: 650; }
      footer {
        margin-top: 28px;
        color: #64748b;
        font-size: 14px;
      }
      @media (max-width: 820px) {
        main { padding-top: 48px; }
        .pipeline, .details { grid-template-columns: 1fr; }
        .stage { min-height: 96px; }
        .stage:not(:last-child)::after {
          content: "↓";
          right: 24px;
          top: auto;
          bottom: -24px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow"><span class="dot"></span> Container service online</div>
      <h1>Stream gRPC through a Worker.</h1>
      <p class="lede">
        Raw bytes flow through a Worker and Durable Object into a gRPC service
        running inside a Cloudflare Container. The edge proxy never needs to
        parse HTTP/2 or understand the protobuf schema.
      </p>

      <section class="card" aria-labelledby="architecture-title">
        <div class="card-header">
          <h2 id="architecture-title">Bidirectional data path</h2>
          <span class="badge">${status.protocol}</span>
        </div>
        <ol class="pipeline">${stages}</ol>
        <div class="terminal">
          <span class="prompt">$</span>
          <code>npm run grpc:client</code>
        </div>
      </section>

      <section class="details" aria-label="Connection details">
        <div class="detail">
          <span class="label">Local gRPC address</span>
          <span class="value">${status.localGrpcAddress}</span>
        </div>
        <div class="detail">
          <span class="label">Container port</span>
          <span class="value">${status.containerPort}</span>
        </div>
        <div class="detail">
          <span class="label">Service method</span>
          <span class="value">ByteStream.Chat</span>
        </div>
      </section>

      <footer>HTTP status: <code>/api/status</code> · Health check: <code>/health</code></footer>
    </main>
  </body>
</html>`;
}
