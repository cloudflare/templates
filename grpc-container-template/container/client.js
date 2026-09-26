const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const target = process.argv[2] || "127.0.0.1:8788";
const messageCount = Number.parseInt(process.argv[3] || "4", 10);
const messageIntervalMs = Number.parseInt(process.argv[4] || "200", 10);
const protoPath =
	process.env.PROTO_PATH || path.resolve(__dirname, "../proto/bytes.proto");

if (!Number.isInteger(messageCount) || messageCount < 1) {
	throw new Error("message count must be a positive integer");
}

if (!Number.isInteger(messageIntervalMs) || messageIntervalMs < 0) {
	throw new Error("message interval must be a non-negative integer");
}

const definition = protoLoader.loadSync(protoPath, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});
const proto = grpc.loadPackageDefinition(definition).cloudflare.grpcdemo;
const client = new proto.ByteStream(target, grpc.credentials.createInsecure());
const call = client.Chat();
const startedAt = Date.now();

function elapsed() {
	return `${String(Date.now() - startedAt).padStart(4, " ")}ms`;
}

call.on("data", (chunk) => {
	const payload = Buffer.isBuffer(chunk.payload)
		? chunk.payload
		: Buffer.from(chunk.payload || "");
	console.log(
		`[${elapsed()}] server -> client: ${payload.toString().trimEnd()}`,
	);
});

call.on("end", () => {
	console.log(`[${elapsed()}] server ended the response stream`);
	client.close();
});

call.on("error", (error) => {
	if (error.code !== grpc.status.CANCELLED) {
		console.error("stream error", error);
		process.exitCode = 1;
	}
	client.close();
});

let sent = 0;
let timer;

function sendNext() {
	sent += 1;
	const message = `streaming message ${sent}/${messageCount}\n`;

	console.log(`[${elapsed()}] client -> server: ${message.trimEnd()}`);
	call.write({ payload: Buffer.from(message) });

	if (sent === messageCount) {
		if (timer) {
			clearInterval(timer);
		}
		console.log(`[${elapsed()}] client half-closes its request stream`);
		call.end();
	}
}

sendNext();
if (sent < messageCount) {
	timer = setInterval(sendNext, messageIntervalMs);
}
