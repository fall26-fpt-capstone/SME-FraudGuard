CREATE TABLE subscription_plan_offers (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL CHECK (length(trim(name)) > 0),
    description VARCHAR(2000) NOT NULL CHECK (length(trim(description)) > 0),
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('FREE', 'SUBSCRIPTION')),
    monthly_price NUMERIC(19,4) NOT NULL CHECK (monthly_price >= 0),
    annual_price NUMERIC(19,4) NOT NULL CHECK (annual_price >= 0),
    currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    tax_treatment VARCHAR(500) NOT NULL CHECK (length(trim(tax_treatment)) > 0),
    available BOOLEAN NOT NULL,
    version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_free_offer_prices CHECK (plan_type <> 'FREE' OR (monthly_price = 0 AND annual_price = 0))
);

CREATE TABLE subscription_plan_offer_history (
    id UUID PRIMARY KEY,
    offer_id UUID NOT NULL REFERENCES subscription_plan_offers(id),
    actor_id UUID NOT NULL,
    action VARCHAR(16) NOT NULL CHECK (action IN ('CREATED', 'UPDATED', 'RETIRED')),
    version BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    plan_type VARCHAR(20) NOT NULL,
    monthly_price NUMERIC(19,4) NOT NULL,
    annual_price NUMERIC(19,4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    tax_treatment VARCHAR(500) NOT NULL,
    available BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    UNIQUE (offer_id, version)
);
