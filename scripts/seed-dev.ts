#!/usr/bin/env node
// scripts/seed-dev.ts — idempotent dev environment seed.
// Creates "Demo Brewing" brewery and dev@mgr.local / password "dev-password-1" admin user.
// NOTE: password "dev-password-1" is intentionally dev-only; use only in local development.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54341";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function seed() {
  try {
    console.log("Seeding development environment...");

    // Ensure brewery exists
    let { data: breweries, error: breweryErr } = await admin
      .from("breweries")
      .select("id")
      .eq("name", "Demo Brewing")
      .single();

    let breweryId: string;
    if (breweryErr) {
      console.log("Creating brewery 'Demo Brewing'...");
      const { data: newBrewery, error: createErr } = await admin
        .from("breweries")
        .insert({ name: "Demo Brewing" })
        .select()
        .single();
      if (createErr) throw createErr;
      breweryId = (newBrewery as any).id;
      console.log(`  Created brewery: ${breweryId}`);
    } else {
      breweryId = (breweries as any).id;
      console.log(`  Brewery already exists: ${breweryId}`);
    }

    // Ensure user exists
    const email = "dev@mgr.local";
    let { data: users, error: userListErr } = await admin.auth.admin.listUsers();
    if (userListErr) throw userListErr;

    let userId: string;
    const existingUser = users.users.find((u) => u.email === email);
    if (existingUser) {
      userId = existingUser.id;
      console.log(`  User already exists: ${userId} (${email})`);
    } else {
      console.log(`Creating user ${email}...`);
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: "dev-password-1",
        email_confirm: true,
      });
      if (createErr) throw createErr;
      userId = newUser.user.id;
      console.log(`  Created user: ${userId}`);
    }

    // Ensure membership exists
    const { data: memberships, error: memberErr } = await admin
      .from("brewery_users")
      .select("*")
      .eq("brewery_id", breweryId)
      .eq("user_id", userId);
    if (memberErr) throw memberErr;

    if (memberships && memberships.length > 0) {
      console.log(`  Membership already exists: ${email} -> ${breweryId}`);
    } else {
      console.log(`Creating membership ${email} -> ${breweryId}...`);
      const { error: insertErr } = await admin
        .from("brewery_users")
        .insert({ brewery_id: breweryId, user_id: userId, role: "admin" });
      if (insertErr) throw insertErr;
      console.log(`  Created membership`);
    }

    console.log("Seed complete!");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

seed();
