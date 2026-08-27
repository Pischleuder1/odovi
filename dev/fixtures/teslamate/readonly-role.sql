-- Disposable compatibility-fixture role, never applied to an operator database.
CREATE ROLE odovi_fixture_reader LOGIN PASSWORD 'fixture-reader-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE teslamate TO odovi_fixture_reader;
GRANT USAGE ON SCHEMA public TO odovi_fixture_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO odovi_fixture_reader;
