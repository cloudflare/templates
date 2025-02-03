import { validateApiTokenResponse } from "@/lib/api";
import { SubscriptionService } from "@/lib/services/subscription";

export async function GET({ locals, params, request }) {
  const { id } = params;
  const { API_TOKEN, DB } = locals.runtime.env;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const subscriptionService = new SubscriptionService(DB);

  try {
    const subscription = await subscriptionService.getById(id);

    if (!subscription) {
      return Response.json(
        { message: "Subscription not found" },
        { status: 404 },
      );
    }

    return Response.json({ subscription });
  } catch (error) {
    return Response.json(
      { message: "Couldn't load subscription" },
      { status: 500 },
    );
  }
}
