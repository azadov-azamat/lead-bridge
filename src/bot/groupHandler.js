/**
 * Telegram guruh ulanishi/ajralishi va admin status o'zgarishi.
 *
 * Yangi mantiq: guruhlar `groups` jadvalida saqlanadi (har user uchun N ta).
 * Sheet'lar groupga `sheets.group_id` orqali bog'lanadi. Yangi group qo'shilganda,
 * agar userda "pending group assign" sheet bo'lsa, o'sha sheetga avtomatik
 * biriktiriladi (onboarding flow ichida `new_group` tugmasi orqali boshlangan).
 */

const messages = require('./messages');
const keyboards = require('./keyboards');
const state = require('./state');
const { inferUserLanguage } = require('./i18n');
const onboarding = require('./onboarding');
const db = require('../db');

function register(bot) {
  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.update.my_chat_member;
    const chat = update.chat;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;
    const fromUserId = update.from?.id;

    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const wasOut = ['left', 'kicked'].includes(oldStatus);
    const nowIn = ['member', 'administrator'].includes(newStatus);
    const wasIn = ['member', 'administrator'].includes(oldStatus);
    const nowOut = ['left', 'kicked'].includes(newStatus);

    // BOT GURUHDAN CHIQARILDI / O'CHIRILDI
    if (wasIn && nowOut) {
      const group = await db.getGroup(chat.id);
      if (!group) return;

      const owner = await db.getUser(group.ownerTelegramId);
      const copy = owner ? getCopy(owner) : messages.forLanguage('uz');

      // Group rowni o'chiramiz — sheetlardagi group_id avtomatik NULL ga tushadi (FK SET NULL)
      await db.deleteGroup(chat.id);
      console.log(
        `[group] bot chiqarildi: owner=${group.ownerTelegramId} group=${chat.id} o'chirildi`
      );

      if (owner) {
        try {
          await ctx.telegram.sendMessage(
            owner.telegramId,
            copy.groupRemovedDm(escapeHtml(chat.title || copy.groupTitleFallback)),
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          console.error('[group] DM yuborilmadi:', err.message);
        }
      }
      return;
    }

    // ADMIN STATUSI O'ZGARDI (member <-> administrator)
    if (wasIn && nowIn && oldStatus !== newStatus) {
      const group = await db.getGroup(chat.id);
      if (!group) return;

      const owner = await db.getUser(group.ownerTelegramId);
      const copy = owner ? getCopy(owner) : messages.forLanguage('uz');
      const becameAdmin = newStatus === 'administrator';
      await db.updateGroup(chat.id, { botIsAdmin: becameAdmin });
      console.log(
        `[group] admin status o'zgardi: group=${chat.id} botIsAdmin=${becameAdmin}`
      );

      if (becameAdmin) {
        try {
          await db.clearNotAdminAlert(chat.id);
        } catch (_) {}
      }

      if (owner) {
        try {
          await ctx.telegram.sendMessage(
            owner.telegramId,
            becameAdmin
              ? copy.botPromoted(escapeHtml(chat.title || copy.groupTitleFallback))
              : copy.botDemoted(escapeHtml(chat.title || copy.groupTitleFallback)),
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          console.error('[group] DM yuborilmadi:', err.message);
        }
      }
      return;
    }

    // BOT YANGI GURUHGA QO'SHILDI
    if (!(wasOut && nowIn)) return;

    if (!fromUserId) {
      console.warn("[group] my_chat_member: from yo'q", update);
      return;
    }

    const user = await db.getUser(fromUserId);
    if (!user) {
      console.warn(
        `[group] noma'lum user ${fromUserId} botni ${chat.id} ga qo'shdi — chiqamiz`
      );
      try {
        await ctx.telegram.leaveChat(chat.id);
      } catch (_) {}
      return;
    }

    const copy = getCopy(user);

    if (user.status !== 'ready') {
      try {
        await ctx.telegram.sendMessage(fromUserId, copy.profileNotReadyForGroup, {
          parse_mode: 'HTML',
        });
      } catch (_) {}
      try {
        await ctx.telegram.leaveChat(chat.id);
      } catch (_) {}
      return;
    }

    // Bu group boshqa userga tegishlimi?
    const existing = await db.getGroup(chat.id);
    if (existing && String(existing.ownerTelegramId) !== String(fromUserId)) {
      console.warn(
        `[group] guruh allaqachon boshqa userga tegishli: group=${chat.id} owner=${existing.ownerTelegramId}`
      );
      try {
        await ctx.telegram.sendMessage(fromUserId, copy.groupAlreadyClaimed, {
          parse_mode: 'HTML',
        });
      } catch (_) {}
      try {
        await ctx.telegram.leaveChat(chat.id);
      } catch (_) {}
      return;
    }

    const isAdmin = newStatus === 'administrator';
    let group;
    try {
      group = await db.upsertGroup({
        id: chat.id,
        ownerTelegramId: fromUserId,
        title: chat.title || null,
        botIsAdmin: isAdmin,
      });
    } catch (err) {
      console.error(`[group] guruh saqlashda xato: ${err.message}`);
      try {
        await ctx.telegram.sendMessage(fromUserId, copy.errorGeneric, {
          parse_mode: 'HTML',
        });
      } catch (_) {}
      try {
        await ctx.telegram.leaveChat(chat.id);
      } catch (_) {}
      return;
    }

    console.log(
      `[group] user=${fromUserId} group=${chat.id} (${chat.title}) ulandi, admin=${isAdmin}`
    );

    // Pending sheet assignment bormi? Bo'lsa darhol bog'laymiz.
    let assignedSheet = null;
    try {
      const pendingSheetId = await onboarding.getPendingGroupAssign(fromUserId);
      if (pendingSheetId) {
        const sheet = await db.getSheet(pendingSheetId);
        if (sheet && String(sheet.userTelegramId) === String(fromUserId)) {
          await db.updateSheet(sheet.id, { groupId: group.id });
          await onboarding.clearPendingGroupAssign(fromUserId);
          assignedSheet = sheet;
        }
      }
    } catch (err) {
      console.error('[group] pending sheet assign xato:', err.message);
    }

    try {
      await ctx.telegram.sendMessage(
        fromUserId,
        copy.groupAdded(escapeHtml(chat.title || copy.groupTitleFallback)),
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[group] DM yuborilmadi:', err.message);
    }

    if (assignedSheet) {
      try {
        await ctx.telegram.sendMessage(
          fromUserId,
          copy.sheetGroupBound(assignedSheet.title, chat.title || copy.groupTitleFallback),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      try {
        await state.resetToMain(fromUserId);
        await ctx.telegram.sendMessage(
          fromUserId,
          copy.mainMenuHint,
          {
            parse_mode: 'HTML',
            ...keyboards.mainMenu(user.language),
          }
        );
      } catch (_) {}
    }

    if (isAdmin) {
      try {
        await ctx.telegram.sendMessage(
          chat.id,
          copy.groupAddedToChat(user.firstName),
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('[group] guruhga xabar yuborilmadi:', err.message);
      }
    } else {
      try {
        await ctx.telegram.sendMessage(
          fromUserId,
          copy.notAdminDm(escapeHtml(chat.title || copy.groupTitleFallback)),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      try {
        await ctx.telegram.sendMessage(chat.id, copy.notAdmin, {
          parse_mode: 'HTML',
        });
      } catch (_) {}
    }
  });
}

function getCopy(user) {
  return messages.forLanguage(inferUserLanguage(user));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { register };
