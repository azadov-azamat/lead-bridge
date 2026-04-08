/**
 * Bot guruhga qo'shilganda / chiqarilganda / admin status o'zgarganda
 * avtomatik aniqlash.
 *
 * Telegram `my_chat_member` event'lari:
 *   - left/kicked → member/administrator      : QO'SHILDI
 *   - member/administrator → left/kicked      : CHIQARILDI
 *   - member ↔ administrator (in-group)       : ADMIN STATUS O'ZGARDI
 *
 * Qoidalar:
 *   1. Botni faqat profile'i 'ready' va ≥1 verified sheet'i bor user qo'sha oladi.
 *   2. Bitta user — bitta guruh (DB darajasida group_id UNIQUE).
 *   3. Bot guruhdan chiqarilsa — group_id ni tozalaymiz va DM da yangi
 *      guruhga qo'shish bo'yicha yo'riqnoma yuboramiz (changegroup oqimi).
 *   4. Admin status DB da `bot_is_admin` ga saqlanadi. Poller faqat
 *      admin bo'lgan guruhlarga lead jo'natadi.
 */

const messages = require('./messages');
const db = require('../db');

function register(bot) {
  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.update.my_chat_member;
    const chat = update.chat;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;
    const fromUserId = update.from?.id;

    // Faqat guruhlar
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const wasOut = ['left', 'kicked'].includes(oldStatus);
    const nowIn = ['member', 'administrator'].includes(newStatus);
    const wasIn = ['member', 'administrator'].includes(oldStatus);
    const nowOut = ['left', 'kicked'].includes(newStatus);

    // ============================================================
    // Bot CHIQARILDI: group_id ni tozalash + DM yo'riqnoma
    // ============================================================
    if (wasIn && nowOut) {
      const owner = await db.getUserByGroupId(chat.id);
      if (!owner) return;

      await db.updateUser(owner.telegramId, {
        groupId: null,
        botIsAdmin: false,
      });
      console.log(
        `[group] bot chiqarildi: user=${owner.telegramId} group=${chat.id} unbind`
      );

      try {
        await ctx.telegram.sendMessage(
          owner.telegramId,
          messages.groupRemovedDm(escapeHtml(chat.title || 'guruh')),
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('[group] DM yuborilmadi:', err.message);
      }
      return;
    }

    // ============================================================
    // ADMIN STATUS O'ZGARDI (in-group, ya'ni member ↔ administrator)
    // ============================================================
    if (wasIn && nowIn && oldStatus !== newStatus) {
      const owner = await db.getUserByGroupId(chat.id);
      if (!owner) return;

      const becameAdmin = newStatus === 'administrator';
      await db.updateUser(owner.telegramId, { botIsAdmin: becameAdmin });
      console.log(
        `[group] admin status o'zgardi: user=${owner.telegramId} group=${chat.id} botIsAdmin=${becameAdmin}`
      );

      // Promotion alert throttle key'larini tozalash — endi alert keraksiz
      try {
        if (becameAdmin) {
          await db.clearNotAdminAlert(owner.telegramId);
        }
      } catch (_) {}

      try {
        await ctx.telegram.sendMessage(
          owner.telegramId,
          becameAdmin
            ? messages.botPromoted(escapeHtml(chat.title || 'guruh'))
            : messages.botDemoted(escapeHtml(chat.title || 'guruh')),
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('[group] DM yuborilmadi:', err.message);
      }
      return;
    }

    // ============================================================
    // Bot QO'SHILDI
    // ============================================================
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

    // Profile tayyor emas
    if (user.status !== 'ready') {
      try {
        await ctx.telegram.sendMessage(
          fromUserId,
          "⚠️ Avval profile'ni tugating va kamida bitta sheet'ni tasdiqlang. /start",
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      try {
        await ctx.telegram.leaveChat(chat.id);
      } catch (_) {}
      return;
    }

    // Hech qanday verified sheet yo'q
    const verifiedCount = await db.countVerifiedSheets(fromUserId);
    if (verifiedCount === 0) {
      try {
        await ctx.telegram.sendMessage(
          fromUserId,
          "⚠️ Avval kamida bitta Google Sheet'ni Facebook Lead Center'ga ulang va tasdiqlang.\n\n/sheets — sheetlar ro'yxati",
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      try {
        await ctx.telegram.leaveChat(chat.id);
      } catch (_) {}
      return;
    }

    // Bitta user = bitta guruh
    if (user.groupId && String(user.groupId) !== String(chat.id)) {
      console.warn(
        `[group] user=${fromUserId} allaqachon group=${user.groupId} ga bog'langan, yangi group=${chat.id} rad etildi`
      );
      try {
        await ctx.telegram.sendMessage(
          fromUserId,
          messages.alreadyBoundDm(user.groupId),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      try {
        await ctx.telegram.sendMessage(chat.id, messages.alreadyBoundGroup, {
          parse_mode: 'HTML',
        });
      } catch (_) {}
      try {
        await ctx.telegram.leaveChat(chat.id);
      } catch (err) {
        console.error('[group] leaveChat xato:', err.message);
      }
      return;
    }

    // Yangi (yoki o'sha) guruhga bog'lanish + admin statusini saqlash
    const isAdmin = newStatus === 'administrator';
    try {
      await db.updateUser(fromUserId, {
        groupId: chat.id,
        botIsAdmin: isAdmin,
      });
    } catch (err) {
      // group_id UNIQUE — boshqa user shu guruhni allaqachon olgan
      console.error(
        `[group] group_id saqlashda xato (unique conflict bo'lishi mumkin): ${err.message}`
      );
      try {
        await ctx.telegram.sendMessage(
          fromUserId,
          "⚠️ Bu guruh allaqachon boshqa foydalanuvchiga bog'langan. Iltimos, boshqa guruh tanlang.",
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      try {
        await ctx.telegram.leaveChat(chat.id);
      } catch (_) {}
      return;
    }

    console.log(
      `[group] user=${fromUserId} group=${chat.id} (${chat.title}) ulandi, admin=${isAdmin}`
    );

    // Foydalanuvchiga DM
    try {
      await ctx.telegram.sendMessage(
        fromUserId,
        messages.groupAdded(escapeHtml(chat.title || 'guruh')),
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[group] DM yuborilmadi:', err.message);
    }

    // Guruhga xush kelibsiz (faqat admin bo'lsa — non-admin holatda
    // bot xabar jo'nata olmasligi mumkin va keraksiz xato beradi)
    if (isAdmin) {
      try {
        await ctx.telegram.sendMessage(
          chat.id,
          messages.groupAddedToChat(user.firstName),
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('[group] guruhga xabar yuborilmadi:', err.message);
      }
    } else {
      // Admin emas — userga DM da batafsil instruktsiya
      try {
        await ctx.telegram.sendMessage(
          fromUserId,
          messages.notAdminDm(escapeHtml(chat.title || 'guruh')),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
      // Guruhga ham (best effort) qisqa eslatma
      try {
        await ctx.telegram.sendMessage(chat.id, messages.notAdmin, {
          parse_mode: 'HTML',
        });
      } catch (_) {}
    }
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { register };
