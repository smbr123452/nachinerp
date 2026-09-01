-- Баримтын дугаарлалт: зэрэгцээ бичилтэд давхцахгүй байхын тулд
-- Postgres sequence ашиглана.
CREATE SEQUENCE IF NOT EXISTS purchase_no_seq START 1;
CREATE SEQUENCE IF NOT EXISTS sale_batch_no_seq START 1;
CREATE SEQUENCE IF NOT EXISTS inventory_count_no_seq START 1;
