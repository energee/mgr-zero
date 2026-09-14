-- material_lot_bin_on_hand (20260914100000) was created without
-- security_invoker; every public view must carry it (tests/schema-rules.test.ts).
-- record_batch_addition reads it from a security-definer function, so the
-- invoker there is the function owner and the RPC keeps working.
alter view public.material_lot_bin_on_hand set (security_invoker = true);
