// lib/chat/slack-adapter.ts — Slack adapter + Chat singleton over the restricted
// Postgres state, and the SlackOAuthPort the lifecycle services call in
// production. Multi-workspace mode: tokens live encrypted in chat_sdk state.
import { Chat } from "chat";
import { createSlackAdapter, type SlackAdapter } from "@chat-adapter/slack";
import { chatState } from "./state";
import type { SlackOAuthPort } from "./oauth";
import type { SlackClientLike, SlackConversationInfo } from "./slack-transport";

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

// Adapters can read/write installation state only after chat.initialize();
// the webhook path initializes itself, everything else awaits this once.
let ready: Promise<Chat<{ slack: SlackAdapter }>> | undefined;
export function chatReady(): Promise<Chat<{ slack: SlackAdapter }>> {
  ready ??= chat().initialize().then(() => chat());
  return ready;
}

// Token-scoped Slack Web API client for one installation, in the minimal shape
// SlackTransport consumes. The bot token comes from the SDK's encrypted state
// and never leaves this closure.
export function slackClientFor(installationId: string): SlackClientLike {
  const slack = slackAdapter();
  const withToken = async <T>(fn: (token: string) => Promise<T>): Promise<T> => {
    await chatReady();
    const installation = await slack.getInstallation(installationId);
    if (!installation) throw Object.assign(new Error("installation_not_found"), { data: { error: "invalid_auth" } });
    return fn(installation.botToken);
  };
  return {
    conversationsInfo: (channel) => withToken(async (token) => {
      const r = (await slack.client.conversations.info({ token, channel })) as { channel?: Partial<SlackConversationInfo> };
      const c = r.channel ?? {};
      return {
        is_private: !!c.is_private, is_archived: !!c.is_archived, is_member: !!c.is_member,
        is_shared: !!c.is_shared, is_ext_shared: !!c.is_ext_shared, is_pending_ext_shared: !!c.is_pending_ext_shared,
      };
    }),
    postMessage: ({ channel, text, blocks }) => withToken(async (token) => {
      const r = await slack.client.chat.postMessage({ token, channel, text, blocks: blocks as never });
      return { channel: r.channel ?? channel, ts: r.ts ?? "" };
    }),
    updateMessage: ({ channel, ts, text, blocks }) => withToken(async (token) => {
      await slack.client.chat.update({ token, channel, ts, text, blocks: blocks as never });
    }),
    publishHome: ({ userId, view }) => withToken(async (token) => {
      await slack.client.views.publish({ token, user_id: userId, view: view as never });
    }),
  };
}

// Wraps the adapter: the SDK stores the token; we add the granted-scope read
// (auth.test echoes the bot token's scopes) so the callback can verify them.
export function slackOAuthPort(): SlackOAuthPort {
  const slack = slackAdapter();
  return {
    async handleOAuthCallback(request, options) {
      await chatReady();
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
    getInstallation: (id) => chatReady().then(() => slack.getInstallation(id)),
    deleteInstallation: (id) => chatReady().then(() => slack.deleteInstallation(id)),
  };
}
