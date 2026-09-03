-- The check-in form stores the optional street-address line separately from
-- city, state, and ZIP. Earlier migrations added the latter fields but omitted
-- this column, causing every inspection insert to fail when PostgREST validates
-- the insert payload.
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS customer_address TEXT;