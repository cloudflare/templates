import { validateApiTokenResponse } from "@/lib/api";
import { SubscriptionService } from "@/lib/services/subscription";

export async function GET({ locals, params, request }) {
  const { API_TOKEN, DB } = locals.runtime.env;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const subscriptionService = new SubscriptionService(DB);

  try {
    const subscriptions = await subscriptionService.getAll();
    return Response.json({ subscriptions });
  } catch (error) {
    return Response.json(
      { message: "Couldn't load subscriptions" },
      { status: 500 },
    );
  }
}

export async function POST({ locals, request }) {
  const { API_TOKEN, DB } = locals.runtime.env;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const subscriptionService = new SubscriptionService(DB);

  try {
    const body = await request.json();
    await subscriptionService.create(body);
    return Response.json(
      {
        message: "Subscription created successfully",
        success: true,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        message: error.message || "Failed to create subscription",
        success: false,
      },
      { status: 500 },
    );
  }
}
