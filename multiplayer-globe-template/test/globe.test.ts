import { env } from "cloudflare:workers";
import { evictDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import worker from "../src/server/index";

async function connect(room: string, id: string, lat = "51.5", lng = "-0.1") {
	const response = await worker.fetch(
		new Request(`https://example.com/parties/globe/${room}?_pk=${id}`, {
			headers: { Upgrade: "websocket" },
			cf: { latitude: lat, longitude: lng },
		}),
		env,
	);
	expect(response.status).toBe(101);
	const socket = response.webSocket!;
	const messages: unknown[] = [];
	socket.addEventListener("message", (event) => {
		messages.push(JSON.parse(String(event.data)));
	});
	socket.accept();
	return { socket, messages };
}

it("returns 404 outside the PartyServer route", async () => {
	const response = await worker.fetch(new Request("https://example.com/"), env);
	expect(response.status).toBe(404);
});

it("sends the visitor's position to its connection", async () => {
	const { socket, messages } = await connect("position", "alice");
	await expect
		.poll(() => messages)
		.toEqual([
			{ type: "add-marker", position: { id: "alice", lat: 51.5, lng: -0.1 } },
		]);
	socket.close();
});

it("broadcasts a new visitor to existing connections", async () => {
	const alice = await connect("broadcast", "alice");
	const bob = await connect("broadcast", "bob", "40.7", "-74");
	await expect
		.poll(() => alice.messages)
		.toContainEqual({
			type: "add-marker",
			position: { id: "bob", lat: 40.7, lng: -74 },
		});
	await expect.poll(() => bob.messages).toHaveLength(2);
	alice.socket.close();
	bob.socket.close();
});

it("restores visitor positions and open sockets after hibernation", async () => {
	const alice = await connect("hibernate", "alice");
	await expect.poll(() => alice.messages).toHaveLength(1);
	await evictDurableObject(env.Globe.getByName("hibernate"));
	expect(alice.socket.readyState).toBe(WebSocket.OPEN);
	const bob = await connect("hibernate", "bob");
	await expect
		.poll(() => bob.messages)
		.toContainEqual({
			type: "add-marker",
			position: { id: "alice", lat: 51.5, lng: -0.1 },
		});
	await expect.poll(() => alice.messages).toHaveLength(2);
	alice.socket.close();
	bob.socket.close();
});

it("removes the right visitor when a hibernated connection closes", async () => {
	const alice = await connect("close", "alice");
	const bob = await connect("close", "bob");
	await expect.poll(() => bob.messages).toHaveLength(2);
	await evictDurableObject(env.Globe.getByName("close"));
	alice.socket.close();
	await expect
		.poll(() => bob.messages)
		.toContainEqual({
			type: "remove-marker",
			id: "alice",
		});
	bob.socket.close();
});
