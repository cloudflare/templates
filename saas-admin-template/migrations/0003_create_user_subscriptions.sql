-- Migration number: 0003    2024-12-23T17:29:51.921Z
DROP TABLE IF EXISTS customer_subscriptions;
CREATE TABLE customer_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    subscription_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'expired')),
    subscription_starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subscription_ends_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE RESTRICT
);

-- Create index for faster queries
CREATE INDEX idx_customer_subscriptions_customer_id ON customer_subscriptions(customer_id);
CREATE INDEX idx_customer_subscriptions_subscription_id ON customer_subscriptions(subscription_id);
CREATE INDEX idx_customer_subscriptions_status ON customer_subscriptions(status);
CREATE INDEX idx_customer_subscriptions_ends_at ON customer_subscriptions(subscription_ends_at);

-- Create trigger for updated_at
CREATE TRIGGER update_customer_subscriptions_updated_at 
    AFTER UPDATE ON customer_subscriptions
    BEGIN
        UPDATE customer_subscriptions 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;

-- Prevent duplicate active subscriptions for the same customer
CREATE UNIQUE INDEX idx_unique_active_subscription 
ON customer_subscriptions(customer_id) 
WHERE status = 'active';
