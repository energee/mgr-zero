#!/usr/bin/env bash
# scripts/test-stack-templates.sh — copies the app's auth email templates into
# the test stack's project. The Supabase CLI rejects a template path (or a
# symlink) outside its project root, so tests/supabase cannot point at
# supabase/templates directly. Run before every `supabase start` of the test
# stack: scripts/test-db.sh locally, the CI test job on a fresh runner.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tests/supabase/supabase/.temp/templates
cp supabase/templates/invite.html tests/supabase/supabase/.temp/templates/invite.html
