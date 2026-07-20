// Minimal RSS 2.0 / Atom feed parsing — no external dependencies.
// Good enough for well-formed blog feeds; extracts a stable id, title, link
// and an optional summary per entry.

export type FeedItem = {
	id: string; // stable unique id (guid / atom id / link)
	title: string;
	link: string;
	summary: string; // optional excerpt, may be empty (raw feed HTML)
};

function decode(s: string): string {
	return s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&")
		.trim();
}

function firstTag(block: string, name: string): string {
	const m = block.match(
		new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
	);
	return m ? decode(m[1]) : "";
}

function atomHref(block: string): string {
	const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
	const pick =
		links.find((l) => /rel=["']?alternate/i.test(l)) ||
		links.find((l) => !/rel=/i.test(l)) ||
		links[0] ||
		"";
	const href = pick.match(/href=["']([^"']+)["']/i);
	return href ? decode(href[1]) : "";
}

export function parseFeed(xml: string): FeedItem[] {
	const items: FeedItem[] = [];

	// RSS 2.0: <item>…</item>
	for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
		const block = m[0];
		const link = firstTag(block, "link");
		const id = firstTag(block, "guid") || link;
		if (id)
			items.push({
				id,
				title: firstTag(block, "title"),
				link,
				summary: firstTag(block, "description"),
			});
	}
	if (items.length) return items;

	// Atom: <entry>…</entry>
	for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
		const block = m[0];
		const link = atomHref(block);
		const id = firstTag(block, "id") || link;
		const summary = firstTag(block, "summary") || firstTag(block, "content");
		if (id) items.push({ id, title: firstTag(block, "title"), link, summary });
	}
	return items;
}

export async function fetchFeedItems(url: string): Promise<FeedItem[]> {
	const res = await fetch(url, {
		headers: { "User-Agent": "newsletter-worker" },
	});
	if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
	return parseFeed(await res.text());
}
