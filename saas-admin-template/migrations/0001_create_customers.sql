-- Migration number: 0001    2024-12-23T17:22:25.583Z
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    notes VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_customers_updated_at 
    AFTER UPDATE ON customers
    BEGIN
        UPDATE customers 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;
