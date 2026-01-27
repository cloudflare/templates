import { routePartykitRequest, Server } from "partyserver";

import type { OutgoingMessage, Position } from "../shared";
import type { Connection, ConnectionContext } from "partyserver";

// This is the state that we'll store on each connection
type ConnectionState = {
	position: Position;
};

export class Globe extends Server {
	onConnect(conn: Connection<ConnectionState>, ctx: ConnectionContext): void {
		// Send room info so the client knows which shard they're in
		conn.send(
			JSON.stringify({
				type: "room-info",
				room: this.name,
			} satisfies OutgoingMessage),
		);

		// Extract position from Cloudflare geolocation headers
		const latitude = ctx.request.cf?.latitude as string | undefined;
		const longitude = ctx.request.cf?.longitude as string | undefined;
		if (!latitude || !longitude) {
			conn.send(
				JSON.stringify({
					type: "error",
					message: "Could not determine your location",
				} satisfies OutgoingMessage),
			);
			conn.close(4000, "Missing geolocation");
			return;
		}
		const position: Position = {
			lat: parseFloat(latitude),
			lng: parseFloat(longitude),
			id: conn.id,
		};
		conn.setState({ position });

		// Send existing markers to the new connection, and notify others of the new user
		for (const connection of this.getConnections<ConnectionState>()) {
			// Skip connections that don't have position state yet (early return in onConnect)
			const connectionPosition = connection.state?.position;
			if (!connectionPosition) {
				continue;
			}

			try {
				conn.send(
					JSON.stringify({
						type: "add-marker",
						position: connectionPosition,
					} satisfies OutgoingMessage),
				);
			} catch {
				// New connection failed to receive - it will trigger onClose/onError
				return;
			}

			// Send the new connection's position to all other connections
			if (connection.id !== conn.id) {
				try {
					connection.send(
						JSON.stringify({
							type: "add-marker",
							position,
						} satisfies OutgoingMessage),
					);
				} catch {
					this.onCloseOrError(connection);
				}
			}
		}
	}

	// Whenever a connection closes (or errors), we'll broadcast a message to all
	// other connections to remove the marker.
	onCloseOrError(connection: Connection) {
		this.broadcast(
			JSON.stringify({
				type: "remove-marker",
				id: connection.id,
			} satisfies OutgoingMessage),
			[connection.id],
		);
	}

	onClose(connection: Connection): void | Promise<void> {
		this.onCloseOrError(connection);
	}

	onError(connection: Connection): void | Promise<void> {
		this.onCloseOrError(connection);
	}
}

// Shard users across multiple DO instances to avoid single-DO bottleneck.
// See: https://developers.cloudflare.com/durable-objects/best-practices/
const MAX_GLOBES = 10;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// For WebSocket upgrades, randomly assign to a globe instance.
		// PartyServer routes based on the room name in the URL path.
		if (request.headers.get("Upgrade") === "websocket") {
			const url = new URL(request.url);
			if (url.pathname.endsWith("/default")) {
				const globe = Math.floor(Math.random() * MAX_GLOBES);
				url.pathname = url.pathname.replace(/\/default$/, `/globe-${globe}`);
				request = new Request(url, request);
			}
		}

		return (
			(await routePartykitRequest(request, { ...env })) ||
			new Response("Not Found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
