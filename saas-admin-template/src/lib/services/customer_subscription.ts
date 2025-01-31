export const CUSTOMER_SUBSCRIPTION_QUERIES = {
  BASE_SELECT: `
    SELECT 
      customer_subscriptions.*,
      customers.name as customer_name,
      customers.email as customer_email,
      subscriptions.name as subscription_name,
      subscriptions.description as subscription_description,
      subscriptions.price as subscription_price
    FROM customer_subscriptions
    LEFT JOIN customers 
      ON customer_subscriptions.customer_id = customers.id
    LEFT JOIN subscriptions 
      ON customer_subscriptions.subscription_id = subscriptions.id
  `,
  INSERT_CUSTOMER_SUBSCRIPTION: `
    INSERT INTO customer_subscriptions 
    (customer_id, subscription_id, status, subscription_ends_at) 
    VALUES (?, ?, ?, ?)
  `,
  UPDATE_STATUS: `
    UPDATE customer_subscriptions 
    SET status = ? 
    WHERE id = ?
  `,
  UPDATE_SUBSCRIPTION_ENDS_AT: `
    UPDATE customer_subscriptions 
    SET subscription_ends_at = ? 
    WHERE id = ?
  `,
};

const processCustomerSubscriptionResults = (rows) => {
  const subscriptionsMap = new Map();

  rows.forEach((row) => {
    if (!subscriptionsMap.has(row.id)) {
      const customerSubscription = {
        id: row.id,
        status: row.status,
        subscription_ends_at: row.subscription_ends_at,
        customer: {
          id: row.customer_id,
          name: row.customer_name,
          email: row.customer_email,
        },
        subscription: {
          id: row.subscription_id,
          name: row.subscription_name,
          description: row.subscription_description,
          price: row.subscription_price,
        },
      };

      subscriptionsMap.set(row.id, customerSubscription);
    }
  });

  return Array.from(subscriptionsMap.values());
};

export class CustomerSubscriptionService {
  constructor(DB) {
    this.DB = DB;
  }

  async getById(id) {
    const query = `${CUSTOMER_SUBSCRIPTION_QUERIES.BASE_SELECT} WHERE customer_subscriptions.id = ?`;
    const response = await this.DB.prepare(query).bind(id).all();

    if (response.success) {
      const [customerSubscription] = processCustomerSubscriptionResults(
        response.results,
      );
      return customerSubscription;
    }
    return null;
  }

  async getByCustomerId(customerId) {
    const query = `${CUSTOMER_SUBSCRIPTION_QUERIES.BASE_SELECT} WHERE customer_subscriptions.customer_id = ?`;
    const response = await this.DB.prepare(query).bind(customerId).all();

    if (response.success) {
      return processCustomerSubscriptionResults(response.results);
    }
    return [];
  }

  async getAll() {
    const query = `${CUSTOMER_SUBSCRIPTION_QUERIES.BASE_SELECT} ORDER BY customer_subscriptions.id ASC`;
    const response = await this.DB.prepare(query).all();

    if (response.success) {
      return processCustomerSubscriptionResults(response.results);
    }
    return [];
  }

  async create(customerSubscriptionData) {
    const {
      customer_id,
      subscription_id,
      status = "active",
      subscription_ends_at = Date.now() + 60 * 60 * 24 * 30, // 30 days from now by default
    } = customerSubscriptionData;

    const response = await this.DB.prepare(
      CUSTOMER_SUBSCRIPTION_QUERIES.INSERT_CUSTOMER_SUBSCRIPTION,
    )
      .bind(customer_id, subscription_id, status, subscription_ends_at)
      .run();

    if (!response.success) {
      throw new Error("Failed to create customer subscription");
    }

    return {
      success: true,
      customerSubscriptionId: response.meta.last_row_id,
    };
  }

  async updateStatus(id, status) {
    const response = await this.DB.prepare(
      CUSTOMER_SUBSCRIPTION_QUERIES.UPDATE_STATUS,
    )
      .bind(status, id)
      .run();

    if (!response.success) {
      throw new Error("Failed to update customer subscription status");
    }

    return { success: true };
  }

  async updateSubscriptionEndsAt(id, subscriptionEndsAt) {
    const response = await this.DB.prepare(
      CUSTOMER_SUBSCRIPTION_QUERIES.UPDATE_SUBSCRIPTION_ENDS_AT,
    )
      .bind(subscriptionEndsAt, id)
      .run();

    if (!response.success) {
      throw new Error("Failed to update subscription end date");
    }

    return { success: true };
  }
}
