const ACRONYM_PATTERN =
	/(?<![\p{L}\p{N}_])(DDoS|\p{Lu}{2,})(s)?(?![\p{L}\p{N}_])/gu;
const WRITTEN_PAUSE_PATTERN = /\s*(?:--+|\u2014|;)\s*/g;
const ELLIPSIS_SPACING_PATTERN = /\s*\.{3}\s*/g;
const REPEATED_ELLIPSES_PATTERN = /(?:\.\.\.\s*){2,}/g;
const DOUBLE_QUOTE_PATTERN = /["\u201c\u201d]/g;

export function prepareTextForSpeech(text: string): string {
	return text
		.replace(DOUBLE_QUOTE_PATTERN, "")
		.replace(WRITTEN_PAUSE_PATTERN, "...")
		.replace(/\s+([,.!?])/g, "$1")
		.replace(ELLIPSIS_SPACING_PATTERN, "... ")
		.replace(REPEATED_ELLIPSES_PATTERN, "... ")
		.replace(
			ACRONYM_PATTERN,
			(_match: string, acronym: string, plural: string | undefined): string => {
				const spokenLetters =
					acronym === "AI"
						? "A.I"
						: Array.from(acronym.toUpperCase()).join(" ");
				return plural ? `${spokenLetters}'s` : spokenLetters;
			},
		)
		.replace(/\s+/g, " ")
		.trim();
}
