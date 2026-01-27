import "./styles.css";

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import createGlobe from "cobe";
import usePartySocket from "partysocket/react";

import type { OutgoingMessage } from "../shared";

function Globe({ onShuffle }: { onShuffle: () => void }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [counter, setCounter] = useState(0);
	// A map of marker IDs to their positions.
	// We use a ref because the globe's `onRender` callback is called on every
	// animation frame, and we don't want to re-render the component each time.
	const positions = useRef<
		Map<string, { location: [number, number]; size: number }>
	>(new Map());

	const socket = usePartySocket({
		room: "default",
		party: "globe",
		onMessage(evt) {
			if (typeof evt.data !== "string") {
				return;
			}
			let message: OutgoingMessage;
			try {
				message = JSON.parse(evt.data) as OutgoingMessage;
			} catch {
				console.warn("Failed to parse WebSocket message");
				return;
			}

			if (message.type === "room-info") {
				// Server confirms which shard we connected to
			} else if (message.type === "add-marker") {
				positions.current.set(message.position.id, {
					location: [message.position.lat, message.position.lng],
					size: message.position.id === socket.id ? 0.1 : 0.05,
				});
				setCounter((c) => c + 1);
			} else if (message.type === "remove-marker") {
				// Only decrement counter if the marker actually existed
				if (positions.current.delete(message.id)) {
					setCounter((c) => c - 1);
				}
			} else if (message.type === "error") {
				console.error("Server error:", message.message);
			}
		},
	});

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		let phi = 0;
		const globe = createGlobe(canvas, {
			devicePixelRatio: 2,
			width: 600 * 2,
			height: 600 * 2,
			phi: 0,
			theta: 0,
			dark: 1,
			diffuse: 0.8,
			mapSamples: 16000,
			mapBrightness: 6,
			baseColor: [0.3, 0.3, 0.3],
			markerColor: [0.8, 0.1, 0.1],
			glowColor: [0.2, 0.2, 0.2],
			markers: [],
			opacity: 0.7,
			onRender: (state) => {
				// Called on every animation frame.
				// `state` will be an empty object, return updated params.

				// Get the current positions from our map
				state.markers = [...positions.current.values()];

				// Rotate the globe
				state.phi = phi;
				phi += 0.01;
			},
		});

		return () => {
			globe.destroy();
		};
	}, []);

	return (
		<div
			className="App"
			style={{
				height: "calc(100vh - 40px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
			}}
		>
			<h1>Where's everyone at?</h1>
			<p style={{ marginTop: 0, opacity: 0.7 }}>
				Real-time multiplayer-like coordination built on{" "}
				<a href="https://workers.cloudflare.com/product/durable-objects/">
					Cloudflare Durable Objects
				</a>
			</p>
			{counter !== 0 ? (
				<p>
					<b>{counter}</b> {counter === 1 ? "person" : "people"} connected to
					your{" "}
					<a
						href="#"
						onClick={(e) => {
							e.preventDefault();
							onShuffle();
						}}
					>
						shard
					</a>
					.
				</p>
			) : (
				<p>&nbsp;</p>
			)}

			<canvas
				ref={canvasRef}
				style={{ width: 600, height: 600, maxWidth: "90vw", aspectRatio: 1 }}
			/>

			<p style={{ marginTop: "auto" }}>
				Powered by <a href="https://cobe.vercel.app/">Cobe</a>,{" "}
				<a href="https://www.npmjs.com/package/phenomenon">Phenomenon</a> and{" "}
				<a href="https://npmjs.com/package/partyserver/">PartyServer</a>.{" "}
				<a href="https://github.com/cloudflare/templates/tree/main/multiplayer-globe-template">
					Code
				</a>
			</p>
		</div>
	);
}

// App wrapper that remounts Globe component to force reconnection to a new shard
function App() {
	const [key, setKey] = useState(0);
	return <Globe key={key} onShuffle={() => setKey((k) => k + 1)} />;
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(<App />);
}
