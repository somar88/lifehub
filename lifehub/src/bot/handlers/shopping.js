const requireLinked = require('../middleware/requireLinked');
const ShoppingList = require('../../models/ShoppingList');

function register(bot) {
  bot.command('shopping', requireLinked, async (ctx) => {
    const user = ctx.state.user;
    const text = ctx.message.text.replace(/^\/shopping\s*/i, '').trim();

    const lists = await ShoppingList.find({ userId: user._id });
    if (!lists.length) return ctx.reply('🛒 No shopping lists. Create one in the app.');

    if (!text) {
      const lines = lists.map(l => {
        const unchecked = (l.items || []).filter(i => !i.checked).length;
        return `• ${l.name} (${unchecked} remaining)`;
      });
      return ctx.reply(`🛒 Shopping Lists:\n\n${lines.join('\n')}`);
    }

    const list = lists.find(l => l.name.toLowerCase() === text.toLowerCase());
    if (!list) return ctx.reply(`List "${text}" not found.`);

    const lines = (list.items || []).map(i => `${i.checked ? '✅' : '⬜'} ${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`);
    return ctx.reply(`🛒 ${list.name}:\n\n${lines.join('\n') || '(empty)'}`);
  });

  bot.command('additem', requireLinked, async (ctx) => {
    const text = ctx.message.text.replace(/^\/additem\s*/i, '').trim();
    const spaceIdx = text.indexOf(' ');
    if (spaceIdx < 0) return ctx.reply('Usage: /additem <list> <item>\nExample: /additem Groceries Milk');

    const listName = text.slice(0, spaceIdx).trim();
    const itemName = text.slice(spaceIdx + 1).trim();
    if (!itemName) return ctx.reply('Usage: /additem <list> <item>');

    const list = await ShoppingList.findOne({ userId: ctx.state.user._id, name: new RegExp(`^${listName}$`, 'i') });
    if (!list) return ctx.reply(`List "${listName}" not found.`);

    list.items.push({ name: itemName, checked: false, quantity: 1 });
    await list.save();
    return ctx.reply(`✅ Added "${itemName}" to ${list.name}.`);
  });

  bot.command('check', requireLinked, async (ctx) => {
    const text = ctx.message.text.replace(/^\/check\s*/i, '').trim();
    const spaceIdx = text.indexOf(' ');
    if (spaceIdx < 0) return ctx.reply('Usage: /check <list> <item>');

    const listName = text.slice(0, spaceIdx).trim();
    const itemName = text.slice(spaceIdx + 1).trim();

    const list = await ShoppingList.findOne({ userId: ctx.state.user._id, name: new RegExp(`^${listName}$`, 'i') });
    if (!list) return ctx.reply(`List "${listName}" not found.`);

    const item = list.items.find(i => i.name.toLowerCase().includes(itemName.toLowerCase()));
    if (!item) return ctx.reply(`Item "${itemName}" not found in ${list.name}.`);

    item.checked = !item.checked;
    await list.save();
    return ctx.reply(`${item.checked ? '✅' : '⬜'} "${item.name}" ${item.checked ? 'checked' : 'unchecked'}.`);
  });

  bot.command('deletelist', requireLinked, async (ctx) => {
    const listName = ctx.message.text.replace(/^\/deletelist\s*/i, '').trim();
    if (!listName) return ctx.reply('Usage: /deletelist <list name>');

    const list = await ShoppingList.findOneAndDelete({ userId: ctx.state.user._id, name: new RegExp(`^${listName}$`, 'i') });
    if (!list) return ctx.reply(`List "${listName}" not found.`);
    return ctx.reply(`🗑 Deleted list: ${list.name}`);
  });
}

module.exports = { register };
