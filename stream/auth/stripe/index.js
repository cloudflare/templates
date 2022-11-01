import { Router } from 'itty-router';
import { json, status } from 'itty-router-extras';
import Stripe from 'stripe';

function createStripeClient(STRIPE_SECRET_KEY) {
	return Stripe(STRIPE_SECRET_KEY, {
		httpClient: Stripe.createFetchHttpClient(),
	});
}

const router = Router();

// TODO: Either use this endpoint to show the price on the homepage
// Or just remove.
router.get('/api/config', async (request, env) => {
	const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
	const price = await stripe.prices.retrieve(env.PRICE);

	return json({
		publicKey: env.STRIPE_PUBLISHABLE_KEY,
		unitAmount: price.unit_amount,
		currency: price.currency,
	});
});

router.get('/api/checkout-session', async (request, env) => {
	const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
	const { sessionId } = request.query;
	const session = await stripe.checkout.sessions.retrieve(sessionId);
	return json(session);
});

router.post('/api/create-checkout-session', async (request, env) => {
	const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
	const apiDomainUrl = env.API_DOMAIN;

	const session = await stripe.checkout.sessions.create({
		mode: 'payment',
		line_items: [
			{
				price: env.PRICE,
				quantity: 1,
			},
		],
		success_url: `${apiDomainUrl}/api/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${apiDomainUrl}/api/canceled`,
		billing_address_collection: 'auto',
	});

	return Response.redirect(session.url, 303);
});

router.get('/api/success', async (request, env) => {
	const {
		CLOUDFLARE_ACCOUNT_ID,
		CLOUDFLARE_API_TOKEN,
		CLOUDFLARE_STREAM_LIVE_INPUT_UID,
		STRIPE_SECRET_KEY,
		DOMAIN,
	} = env;
	const stripe = createStripeClient(STRIPE_SECRET_KEY);
	const session = await stripe.checkout.sessions.retrieve(request.query.session_id);
	if (!session) {
		throw new Error('No session found');
	}

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${CLOUDFLARE_STREAM_LIVE_INPUT_UID}/token`,
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
				'content-type': 'application/json;charset=UTF-8',
			},
			body: JSON.stringify({
				exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
				downloadable: true,
				accessRules: [{ type: 'ip.geoip.country', country: ['US', 'MX'], action: 'allow' }],
			}),
		}
	);
	const { result } = await response.json();

	return Response.redirect(
		`${DOMAIN}/watch?token=${result.token}&session_id=${request.query.session_id}`,
		303
	);
});

router.get('/api/canceled', () => {
	return Response.redirect(`${domainUrl}/canceled`, 303);
});

router.post('/api/webhook', async (request, env) => {
	let data;
	let eventType;
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = request.headers['stripe-signature'];

    try {
        const text = await request.text();
        event = stripe.webhooks.constructEvent(text, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`);
        return res.sendStatus(400);
    }
    // Extract the object from the event.
    data = event.data;
    eventType = event.type;

	if (eventType === 'checkout.session.completed') {
		console.log(`🔔  Payment received!`);
	}

	return status(200);
});

export default {
	async fetch(...args) {
		return router.handle(...args);
	},
};
