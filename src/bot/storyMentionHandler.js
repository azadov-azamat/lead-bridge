const messages = require('./messages');
const { inferUserLanguage } = require('./i18n');
const db = require('../db');

function register(bot) {
  bot.use(async (ctx, next) => {
    const storyMention = extractStoryMention(ctx);
    if (!storyMention) return next();

    await db.upsertUser({
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      language: ctx.from.language_code,
    });

    const mentionCount = await db.incrementMentionCount(ctx.from.id);
    const user = await db.getUser(ctx.from.id);
    const copy = messages.forLanguage(inferUserLanguage(user, ctx.from.language_code));

    await ctx.replyWithHTML(copy.storyMentionReply(mentionCount));
  });
}

function extractStoryMention(ctx) {
  const message =
    ctx.update?.message ||
    ctx.update?.edited_message ||
    ctx.update?.channel_post ||
    ctx.update?.edited_channel_post;

  if (!ctx.from || !message || message.chat?.type !== 'private') return null;

  if (message.story || message.reply_to_story || message.external_reply?.story) {
    return message;
  }

  const botUsername = ctx.botInfo?.username
    ? `@${String(ctx.botInfo.username).toLowerCase()}`
    : null;
  if (!botUsername) return null;

  const rawText = String(message.text || message.caption || '');
  const text = rawText.toLowerCase();
  if (!text || !text.includes(botUsername)) return null;

  const entities = [
    ...(message.entities || []),
    ...(message.caption_entities || []),
  ];

  const hasMentionEntity = entities.some((entity) => {
    if (entity.type !== 'mention') return false;
    const fragment = rawText
      .slice(entity.offset, entity.offset + entity.length)
      .toLowerCase();
    return fragment === botUsername;
  });

  if (hasMentionEntity && /(story|стори|истори)/i.test(text)) {
    return message;
  }

  return null;
}

module.exports = { register };
