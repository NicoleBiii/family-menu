# Database CA certificates

Public CA certificates used to verify the database server's TLS certificate. They are not
secrets. The production database URL points at a file here, for example
`?sslmode=verify-full&sslrootcert=/app/certs/supabase-ca.crt` (ADR 0010).

- `supabase-ca.crt`: download from the production Supabase project (Database settings → SSL
  configuration → Download certificate) and commit it unchanged.
