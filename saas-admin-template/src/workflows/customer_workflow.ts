import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

type Env = {
  CUSTOMER_WORKFLOW: WorkflowEntrypoint<Env, Params>;
  DB: D1Database;
};

type Params = {
  id: string;
};

export class CustomerWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { DB } = this.env;
    const { id } = event.payload;

    const customer = await step.do("fetch customer", async () => {
      const resp = await DB.prepare(`SELECT * FROM customers WHERE id = ?`)
        .bind(id)
        .run();
      if (resp.success) return resp.results[0];
      return null;
    });

    if (customer) {
      await step.do("conditional customer step", async () => {
        console.log(
          "A customer was found! This step only runs if a customer is found.",
        );
        console.log(customer);
      });
    }

    await step.do("example step", async () => {
      console.log(
        "This step always runs, and is the last step in the workflow.",
      );
    });
  }
}
