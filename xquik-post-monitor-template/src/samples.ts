import type { Post } from "./xquik";

export const SAMPLE_POSTS: Post[] = [
	{
		id: "sample-3",
		text: "Sample post 3. Live posts replace this text after you add an API key.",
		authorUsername: "sample_author",
		authorName: "Sample Author",
		createdAt: "2026-01-15T12:00:00.000Z",
		likeCount: 42,
		repostCount: 7,
		replyCount: 3,
	},
	{
		id: "sample-2",
		text: "Sample post 2. Line breaks stay in place.\n\nThis line starts a new paragraph.",
		authorUsername: "sample_writer",
		authorName: "Sample Writer",
		createdAt: "2026-01-15T09:30:00.000Z",
		likeCount: 18,
		repostCount: 2,
		replyCount: 1,
	},
	{
		id: "sample-1",
		text: "Sample post 1. Sample posts have no link because no real post exists.",
		authorUsername: "sample_reader",
		authorName: "Sample Reader",
		createdAt: "2026-01-15T06:00:00.000Z",
		likeCount: 5,
		repostCount: 0,
		replyCount: 0,
	},
];
