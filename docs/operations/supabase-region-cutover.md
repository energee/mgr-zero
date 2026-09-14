# Supabase region cutover

Production destination: `uogrvqmrbmolvtftotsf` (`us-east-1`), alongside Vercel `iad1`.
The original `ugzhwxzictzvrzlacjmv` project is retained; do not delete it as cleanup.

`CHAT_STATE_DATABASE_URL` uses a dedicated login belonging only to `mgr_chat_sdk`,
through the session pooler (port 5432). Set `CHAT_STATE_DATABASE_CA` to the PEM
certificate from Supabase's Database Settings. Both chat connection paths trust
this CA and require certificate verification; local connections are unchanged
when the variable is unset. Do not disable certificate verification to fix TLS.

TDD evidence: `bunx vitest run tests/chat-state-tls.test.ts` initially failed
because the configured CA was ignored; both tests pass with the shared connection
configuration. The tests cover custom-CA trust and unchanged local behavior.
The hosted migration and restricted chat connections were separately checked.
Full database-backed suites remain CI-only; coverage was not measured locally.
