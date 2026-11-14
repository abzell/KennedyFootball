-- Simulated-clock offset for the optional TEST site (only read when TEST_MODE is set).
CREATE TABLE IF NOT EXISTS test_clock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  offset_ms INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO test_clock (id, offset_ms) VALUES (1, 0);
