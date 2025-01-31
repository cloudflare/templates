export const CUSTOMER_QUERIES = {
  BASE_SELECT: `
    SELECT 
      customers.*,
      customer_subscriptions.id as subscription_id,
      customer_subscriptions.status as subscription_status,
      subscriptions.name as subscription_name,
      subscriptions.description as subscription_description,
      subscriptions.price as subscription_price
    FROM customers 
    LEFT JOIN customer_subscriptions 
      ON customers.id = customer_subscriptions.customer_id
    LEFT JOIN subscriptions
      ON customer_subscriptions.subscription_id = subscriptions.id
  `,
  INSERT_CUSTOMER: `INSERT INTO customers (name, email, notes) VALUES (?, ?, ?)`,
  INSERT_CUSTOMER_SUBSCRIPTION: `
    INSERT INTO customer_subscriptions (customer_id, subscription_id, status) 
    VALUES (?, ?, ?)
  `,
  GET_BY_ID: `WHERE customers.id = ?`,
  GET_BY_EMAIL: `WHERE customers.email = ?`,
};

const processCustomerResults = (rows: any[]) => {
  const customersMap = new Map();

  rows.forEach((row) => {
    if (!customersMap.has(row.id)) {
      const customer = { ...row };
      if (row.subscription_id) {
        customer.subscription = {
          id: row.subscription_id,
          status: row.subscription_status,
          name: row.subscription_name,
          description: row.subscription_description,
          price: row.subscription_price,
        };
      }
      // Clean up raw join fields
      delete customer.subscription_id;
      delete customer.subscription_status;
      delete customer.subscription_name;
      delete customer.subscription_description;
      delete customer.subscription_price;

      customersMap.set(row.id, customer);
    }
  });

  return Array.from(customersMap.values());
};

export class CustomerService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getById(id: number) {
    const query = `${CUSTOMER_QUERIES.BASE_SELECT} ${CUSTOMER_QUERIES.GET_BY_ID}`;
    const response = await this.DB.prepare(query).bind(id).all();

    if (response.success) {
      const [customer] = processCustomerResults(response.results);
      return customer;
    }
    return null;
  }

  async getByEmail(email: string) {
    const query = `${CUSTOMER_QUERIES.BASE_SELECT} ${CUSTOMER_QUERIES.GET_BY_EMAIL}`;
    const response = await this.DB.prepare(query).bind(email).all();

    if (response.success) {
      const [customer] = processCustomerResults(response.results);
      return customer;
    }
    return null;
  }

  async getAll() {
    const query = `${CUSTOMER_QUERIES.BASE_SELECT} ORDER BY customers.id ASC`;
    const response = await this.DB.prepare(query).all();

    if (response.success) {
      return processCustomerResults(response.results);
    }
    return [];
  }

  async create(customerData: {
    name: string;
    email: string;
    notes?: string;
    subscription?: {
      id: number;
      status: string;
    };
  }) {
    const { name, email, notes, subscription } = customerData;

    const customerResponse = await this.DB.prepare(
      CUSTOMER_QUERIES.INSERT_CUSTOMER,
    )
      .bind(name, email, notes || null)
      .run();

    if (!customerResponse.success) {
      throw new Error("Failed to create customer");
    }

    const customerId = customerResponse.meta.last_row_id;

    if (subscription) {
      const subscriptionResponse = await this.DB.prepare(
        CUSTOMER_QUERIES.INSERT_CUSTOMER_SUBSCRIPTION,
      )
        .bind(customerId, subscription.id, subscription.status)
        .run();

      if (!subscriptionResponse.success) {
        throw new Error("Failed to create customer subscription relationship");
      }
    }

    return { success: true, customerId };
  }
}
