// Email delivery — bring your own sending infrastructure.
//
// This template collects subscribers and manages unsubscribes out of the box.
// Sending email is the one part you wire up yourself, so you stay in full
// control of your provider, domain, and deliverability. Nothing here is tied
// to any specific service.
//
// To enable sending:
//   1. Add your provider's secret(s) to MailEnv below (and set them on the
//      Worker: dashboard → Settings → Variables and Secrets).
//   2. Flip isEmailConfigured() to check for them.
//   3. Implement sendEmail() using your provider's API (see the example).
//
// The rest of the app only ever calls sendEmail() — you don't need to touch
// anything else.

export type MailEnv = {
	FROM_NAME?: string;
	FROM_EMAIL?: string;
	// Add your provider's secret here, e.g. EMAIL_API_KEY?: string;
} & Record<string, unknown>;

/** Return true once your provider is wired up below. */
export function isEmailConfigured(_env: MailEnv): boolean {
	// e.g. return Boolean(_env.EMAIL_API_KEY);
	return false;
}

export async function sendEmail(
	env: MailEnv,
	opts: {
		to: string;
		subject: string;
		html: string;
		// Ready-made compliance headers (RFC 8058 one-click unsubscribe). Pass
		// them through to your provider — Gmail and Yahoo require them for bulk
		// senders, and mail clients use them for their native Unsubscribe button.
		headers: Record<string, string>;
	},
): Promise<void> {
	throw new Error(
		"Email sending is not configured. Implement sendEmail() in src/email.ts to connect your own provider.",
	);

	// --- Example: most transactional email providers expose an HTTP API you can
	// call straight from a Worker. Delete the throw above and adapt this:
	//
	// const sender = `${env.FROM_NAME || "Newsletter"} <${env.FROM_EMAIL || "newsletter@example.com"}>`;
	// const res = await fetch("https://YOUR_EMAIL_API/send", {
	//   method: "POST",
	//   headers: {
	//     "Content-Type": "application/json",
	//     "Authorization": `Bearer ${env.EMAIL_API_KEY}`,
	//   },
	//   body: JSON.stringify({
	//     from: sender,
	//     to: opts.to,
	//     subject: opts.subject,
	//     html: opts.html,
	//     headers: opts.headers, // List-Unsubscribe & co. — keep these!
	//   }),
	// });
	// if (!res.ok) throw new Error(`email send failed: ${res.status}`);
}
