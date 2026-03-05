import { routePartykitRequest, Server } from "partyserver";

import type { OutgoingMessage, Position } from "../shared";
import type { Connection, ConnectionContext } from "partyserver";

// This is the state that we'll store on each connection
type ConnectionState = {
	position: Position;
};

export class Globe extends Server {
	onConnect(conn: Connection<ConnectionState>, ctx: ConnectionContext) {
		// Whenever a fresh connection is made, we'll
		// send the entire state to the new connection

		// First, let's extract the position from the Cloudflare headers
		const latitude = ctx.request.cf?.latitude as string | undefined;
		const longitude = ctx.request.cf?.longitude as string | undefined;
		if (!latitude || !longitude) {
			console.warn(`Missing position information for connection ${conn.id}`);
			return;
		}
		const position = {
			lat: parseFloat(latitude),
			lng: parseFloat(longitude),
			id: conn.id,
		};
		// And save this on the connection's state
		conn.setState({
			position,
		});

		// Now, let's send the entire state to the new connection
		for (const connection of this.getConnections<ConnectionState>()) {
			try {
				conn.send(
					JSON.stringify({
						type: "add-marker",
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						position: connection.state!.position,
					} satisfies OutgoingMessage),
				);

				// And let's send the new connection's position to all other connections
				if (connection.id !== conn.id) {
					connection.send(
						JSON.stringify({
							type: "add-marker",
							position,
						} satisfies OutgoingMessage),
					);
				}
			} catch {
				this.onCloseOrError(conn);
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return (
			(await routePartykitRequest(request, { ...env })) ||
			new Response("Not Found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
