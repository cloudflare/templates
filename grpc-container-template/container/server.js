const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const port = Number.parseInt(process.env.GRPC_PORT || "50051", 10);
const protoPath =
	process.env.PROTO_PATH || path.resolve(__dirname, "../proto/bytes.proto");

const definition = protoLoader.loadSync(protoPath, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});
const proto = grpc.loadPackageDefinition(definition).cloudflare.grpcdemo;

function chat(call) {
	let messageCount = 0;

	call.write({
		payload: Buffer.from("hello from the container gRPC server\n"),
	});

	call.on("data", (chunk) => {
		messageCount += 1;
		const payload = Buffer.isBuffer(chunk.payload)
			? chunk.payload
			: Buffer.from(chunk.payload || "");

		call.write({
			payload: Buffer.concat([
				Buffer.from(`container echo ${messageCount}: `),
				payload,
			]),
		});
	});

	call.on("end", () => {
		call.write({
			payload: Buffer.from("goodbye from the container gRPC server\n"),
		});
		call.end();
	});

	call.on("error", (error) => {
		console.error(
			JSON.stringify({
				event: "grpc_stream_error",
				message: error instanceof Error ? error.message : String(error),
			}),
		);
	});
}

const server = new grpc.Server();
server.addService(proto.ByteStream.service, { Chat: chat });
server.bindAsync(
	`0.0.0.0:${port}`,
	grpc.ServerCredentials.createInsecure(),
	(error, boundPort) => {
		if (error) {
			console.error(error);
			process.exitCode = 1;
			return;
		}

		console.log(
			JSON.stringify({
				event: "grpc_server_listening",
				port: boundPort,
			}),
		);
	},
);

function shutdown(signal) {
	console.log(JSON.stringify({ event: "grpc_server_stopping", signal }));
	server.tryShutdown((error) => {
		if (error) {
			server.forceShutdown();
			process.exitCode = 1;
		}
	});
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
