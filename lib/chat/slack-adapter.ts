// lib/chat/slack-adapter.ts — Slack adapter + Chat singleton over the restricted
// Postgres state, and the SlackOAuthPort the lifecycle services call in
// production. Multi-workspace mode: tokens live encrypted in chat_sdk state.
import { Chat } from "chat";
import { createSlackAdapter, type SlackAdapter } from "@chat-adapter/slack";
import { chatState } from "./state";
import type { SlackOAuthPort } from "./oauth";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

let adapter: SlackAdapter | undefined;
let instance: Chat<{ slack: SlackAdapter }> | undefined;

export function slackAdapter(): SlackAdapter {
  adapter ??= createSlackAdapter({
    mode: "webhook",
    clientId: required("SLACK_CLIENT_ID"),
    clientSecret: required("SLACK_CLIENT_SECRET"),
    signingSecret: required("SLACK_SIGNING_SECRET"),
    encryptionKey: required("CHAT_SDK_ENCRYPTION_KEY"),
  });
  return adapter;
}

export function chat(): Chat<{ slack: SlackAdapter }> {
  instance ??= new Chat({ userName: "mgr", adapters: { slack: slackAdapter() }, state: chatState() });
  return instance;
}

// Wraps the adapter: the SDK stores the token; we add the granted-scope read
// (auth.test echoes the bot token's scopes) so the callback can verify them.
export function slackOAuthPort(): SlackOAuthPort {
  const slack = slackAdapter();
  chat(); // ensures the adapter is initialised with its state store
  return {
    async handleOAuthCallback(request, options) {
      const result = await slack.handleOAuthCallback(request, options);
      const auth = (await slack.client.auth.test({ token: result.installation.botToken })) as {
        response_metadata?: { scopes?: string[] };
      };
      return {
        teamId: result.teamId,
        enterpriseId: result.enterpriseId,
        isEnterpriseInstall: result.isEnterpriseInstall,
        teamName: result.installation.teamName,
        scopes: auth.response_metadata?.scopes ?? [],
      };
    },
    getInstallation: (id) => slack.getInstallation(id),
    deleteInstallation: (id) => slack.deleteInstallation(id),
  };
}
