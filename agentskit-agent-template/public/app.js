const form = document.querySelector("#chat-form");
const prompt = document.querySelector("#prompt");
const messages = document.querySelector("#messages");
const submit = form.querySelector("button");
const history = [];

function addMessage(role, content = "") {
	const wrapper = document.createElement("div");
	wrapper.className = `message ${role}`;
	if (role === "assistant") {
		const avatar = document.createElement("span");
		avatar.className = "avatar";
		avatar.textContent = "AK";
		wrapper.append(avatar);
	}
	const text = document.createElement("p");
	text.textContent = content;
	wrapper.append(text);
	messages.append(wrapper);
	messages.scrollTop = messages.scrollHeight;
	return text;
}

async function streamReply(response, output) {
	if (!response.ok || !response.body) {
		const data = await response
			.json()
			.catch(() => ({ error: "Request failed" }));
		throw new Error(data.error ?? "Request failed");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done });
		const events = buffer.split("\n\n");
		buffer = done ? "" : (events.pop() ?? "");
		for (const event of events) {
			const line = event.split("\n").find((entry) => entry.startsWith("data:"));
			if (!line) continue;
			const chunk = JSON.parse(line.slice(5));
			if (chunk.type === "text") output.textContent += chunk.content ?? "";
			if (chunk.type === "error")
				throw new Error(chunk.content ?? "Generation failed");
		}
		messages.scrollTop = messages.scrollHeight;
		if (done) break;
	}
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	const content = prompt.value.trim();
	if (!content || submit.disabled) return;

	history.push({ role: "user", content });
	addMessage("user", content);
	const output = addMessage("assistant");
	prompt.value = "";
	submit.disabled = true;

	try {
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ messages: history }),
		});
		await streamReply(response, output);
		history.push({ role: "assistant", content: output.textContent });
	} catch (error) {
		output.textContent =
			error instanceof Error ? error.message : "Generation failed";
	} finally {
		submit.disabled = false;
		prompt.focus();
	}
});
