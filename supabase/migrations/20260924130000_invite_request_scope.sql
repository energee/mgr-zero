-- #457: an invitation request blocks its address only inside its own brewery,
-- and only while it is unfinished. The global unique email let one brewery's
-- unsent request block that address everywhere, and a failed request (lost
-- request id) could never be replaced.
--
-- claim_invite_request still reports a violation of this index as
-- 'invitation already requested'. Failed and complete rows no longer block: a
-- failed row keeps its own auth_token, so a replacement request binds only its
-- own Auth user. If the failed request's Auth call nevertheless commits later,
-- bind_invited_auth_user would move it to pending_membership beside the live
-- replacement; this index then aborts that Auth transaction instead of creating
-- a second account. Existing accounts are still refused before insert.
alter table private.invite_requests drop constraint invite_requests_email_key;
create unique index invite_requests_open_email_idx on private.invite_requests(brewery_id, email)
  where state in ('pending_auth', 'pending_membership');
