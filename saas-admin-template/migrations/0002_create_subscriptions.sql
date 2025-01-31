-- Migration number: 0002    2024-12-23T17:28:56.809Z
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS subscription_features;
DROP TABLE IF EXISTS features;

-- Main subscriptions table
CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Features table
CREATE TABLE features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for subscription-feature relationships
CREATE TABLE subscription_features (
    subscription_id INTEGER NOT NULL,
    feature_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (subscription_id, feature_id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE
);

-- Update triggers
CREATE TRIGGER update_subscriptions_updated_at 
    AFTER UPDATE ON subscriptions
    BEGIN
        UPDATE subscriptions 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;

CREATE TRIGGER update_features_updated_at 
    AFTER UPDATE ON features
    BEGIN
        UPDATE features 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;
