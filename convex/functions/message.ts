import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "./helpers";
import { api, internal } from "../_generated/api";

export const list = authenticatedQuery({
  args: {
    directMessage: v.id("directMessages"),
  },
  handler: async (ctx, { directMessage }) => {
    const member = await ctx.db
      .query("directMessageMembers")
      .withIndex("by_direct_message_user", (q) =>
        q.eq("directMessage", directMessage).eq("user", ctx.user._id)
      )
      .first();
    if (!member) {
      throw new Error("You are not a member of this direct message");
    }
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_direct_message", (q) =>
        q.eq("directMessage", directMessage)
      )
      .collect();
    return await Promise.all(
      messages.map(async (message) => {
        const sender = await ctx.db.get(message.sender);
        const attachments = message.attachments
          ? await Promise.all(
              message.attachments.map(async (attachment) => {
                return await ctx.storage.getUrl(attachment);
              })
            )
          : undefined;
        return { ...message, attachments, sender };
      })
    );
  },
});

export const create = authenticatedMutation({
  args: {
    content: v.string(),
    attachments: v.optional(v.array(v.id("_storage"))),
    directMessage: v.id("directMessages"),
  },
  handler: async (ctx, { content, attachments, directMessage }) => {
    const member = await ctx.db
      .query("directMessageMembers")
      .withIndex("by_direct_message_user", (q) =>
        q.eq("directMessage", directMessage).eq("user", ctx.user._id)
      )
      .first();
    if (!member) {
      throw new Error("You are not a member of this direct message");
    }
    const messageId = await ctx.db.insert("messages", {
      content,
      attachments,
      directMessage,
      sender: ctx.user._id,
    });
    await ctx.scheduler.runAfter(0, internal.functions.typing.remove, {
      directMessage,
      user: ctx.user._id,
    });
    await ctx.scheduler.runAfter(0, internal.functions.moderation.run, {
      id: messageId,
    });
  },
});

export const remove = authenticatedMutation({
  args: {
    id: v.id("messages"),
  },
  handler: async (ctx, { id }) => {
    const message = await ctx.db.get(id);
    if (!message) {
      throw new Error("Message does not exist");
    } else if (message.sender !== ctx.user._id) {
      throw new Error("You are not the sender of this message");
    }
    await ctx.runMutation(internal.functions.moderation.deleteMessage, {
      id,
      reason: "D1",
    });
    if (message.attachments) {
      await Promise.all(
        message.attachments.map(async (attachment) => {
          await ctx.storage.delete(attachment);
        })
      );
    }
  },
});

export const generateUploadUrl = authenticatedMutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const removeFileById = authenticatedMutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.delete(args.storageId);
  },
});
