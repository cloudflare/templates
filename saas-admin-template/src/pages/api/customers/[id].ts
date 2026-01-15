import { CustomerService } from "@/lib/services/customer";
import { validateApiTokenResponse } from "@/lib/api";

export async function GET({ locals, params, request }) {
  const { id } = params;
  const { API_TOKEN, DB } = locals.runtime.env;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const customerService = new CustomerService(DB);
  const customer = await customerService.getById(id);

  if (!customer) {
    return Response.json({ message: "Customer not found" }, { status: 404 });
  }

  return Response.json({ customer: customer });
}
