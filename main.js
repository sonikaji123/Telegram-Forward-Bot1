const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const botToken = 'YOUR_BOT_TOKEN'; // Replace with your bot token
const bot = new TelegramBot(botToken, { polling: true });

const ownerUserId = YOUR_OWNER_USER_ID; // Replace with your user ID
const authorizedUsers = {}; // Object to store authorized user IDs and their data

// Load authorized users data from file if it exists
const authorizedUsersFile = 'authorized_users.json';
if (fs.existsSync(authorizedUsersFile)) {
  const data = fs.readFileSync(authorizedUsersFile);
  Object.assign(authorizedUsers, JSON.parse(data))
}

let isForwarding = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function forwardMessagesInRange(chatId, sourceChatId, destinationChatId, startId, endId) {
  isForwarding = true; // Set forwarding flag to true

  const batchSize = 20; // Number of messages to forward in each batch
  const batchDelay = 2000; // Delay in milliseconds between batches
  const messageDelay = 50; // Delay in milliseconds between messages within a batch
  const floodWaitDelay = 15000; // Delay in milliseconds for "Flood Wait" error

  for (let messageId = startId; messageId <= endId; messageId += batchSize) {
    if (!isForwarding) {
      break; // Stop forwarding if /cancel command is issued
    }

    const endBatchId = Math.min(messageId + batchSize - 1, endId);

    try {
      for (let batchMessageId = messageId; batchMessageId <= endBatchId; batchMessageId++) {
        const message = await bot.forwardMessage(destinationChatId, sourceChatId, batchMessageId, { disable_notification: true });
        const original_text = message.text || message.caption || ''; // Extract the text or caption from the message
        const cleaned_text = original_text.split("\n", 1)[-1]; // Remove the "forwarded from" tag
        if (cleaned_text) {
          await bot.sendMessage(chatId, cleaned_text, { parse_mode: 'HTML' }); // Forward the cleaned message to the destination chat
        }
        if (batchMessageId !== endBatchId) {
          await delay(messageDelay); // Introduce a delay between messages in the same batch
        }
      }
      console.log(`Forwarded messages from ${messageId} to ${endBatchId}`);
      
      if (endBatchId !== endId) {
        await delay(batchDelay); // Introduce a delay between batches (except the last one)
      }
    } catch (error) {
      console.error(`Error forwarding messages:`, error);
      if (error.response && error.response.statusCode === 429) {
        console.log(`Flood Wait error. Waiting for ${floodWaitDelay / 1000} seconds...`);
        await delay(floodWaitDelay);
      }
    }
  }

  isForwarding = false; // Reset the forwarding flag
}

bot.onText(/\/auth (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = parseInt(match[1]);

  if (msg.from.id === ownerUserId) {
    authorizedUsers[userId] = true;
    saveAuthorizedUsers(); 
    bot.sendMessage(chatId, `User ${userId} is now authorized to use the bot...`);
  } else {
    bot.sendMessage(chatId, 'You are not authorized to perform this action...');
  }
});

bot.onText(/\/unauth/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId === ownerUserId) {
    if (authorizedUsers[userId]) {
      delete authorizedUsers[userId];
      saveAuthorizedUsers();
      bot.sendMessage(chatId, 'You are now unauthorized to use the bot...');
    } else {
      bot.sendMessage(chatId, 'You are not authorized to use the bot...');
    }
  } else {
    bot.sendMessage(chatId, 'Only the owner can perform this action...');
  }
});

bot.onText(/\/owner/, (msg) => {
  const chatId = msg.chat.id;
  
  if (msg.from.id === ownerUserId) {
    bot.sendMessage(chatId, 'You are the owner of this bot.');
  } else {
    bot.sendMessage(chatId, 'You are not the owner of this bot.');
  }
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, startMessage, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '𝙊𝙬𝙣𝙚𝙧', url: 'https://t.me/gazabho' }],
        [{ text: '𝙂𝙚𝙩 𝙔𝙤𝙪𝙧𝙨𝙚𝙡𝙛 𝘼𝙪𝙩𝙝𝙤𝙧𝙞𝙯𝙚𝙙', url: 'https://t.me/dev_gagan' }],
      ],
    },
  });
});

bot.onText(/\/forward/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!authorizedUsers[msg.from.id]) {
    bot.sendMessage(chatId, 'You are not authorized to perform this action.');
    return;
  }

  bot.sendMessage(chatId, 'Please choose the message source:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Group', callback_data: 'group' }],
        [{ text: 'Private Chat', callback_data: 'private' }],
      ]
    }
  });
});

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const sourceType = callbackQuery.data;

  if (sourceType !== 'group' && sourceType !== 'private') {
    bot.sendMessage(chatId, 'Invalid source type selected.');
    return;
  }

  bot.sendMessage(chatId, `Please provide the ${sourceType === 'group' ? 'group' : 'private chat'} ID (integer):`);
  bot.once('message', (sourceMessage) => {
    const sourceChatId = parseIntegerMessage(sourceMessage);

    if (isNaN(sourceChatId)) {
      bot.sendMessage(chatId, 'Invalid input. Please resend the chat ID as an integer.');
      return;
    }

    bot.sendMessage(chatId, 'Please provide the destination chat ID (integer):');
    bot.once('message', (destinationMessage) => {
      const destinationChatId = parseIntegerMessage(destinationMessage);

      if (isNaN(destinationChatId)) {
        bot.sendMessage(chatId, 'Invalid input. Please resend the destination chat ID as an integer.');
        return;
      }

      bot.sendMessage(chatId, 'Please provide the start message ID (integer):');
      bot.once('message', (startMessageIdMessage) => {
        const startMessageId = parseIntegerMessage(startMessageIdMessage);

        if (isNaN(startMessageId)) {
          bot.sendMessage(chatId, 'Invalid input. Please resend the start message ID as an integer.');
          return;
        }

        bot.sendMessage(chatId, 'Please provide the end message ID (integer):');
        bot.once('message', (endMessageIdMessage) => {
          const endMessageId = parseIntegerMessage(endMessageIdMessage);

          if (isNaN(endMessageId)) {
            bot.sendMessage(chatId, 'Invalid input. Please resend the end message ID as an integer.');
            return;
          }

          forwardMessagesInRange(chatId, sourceChatId, destinationChatId, startMessageId, endMessageId)
            .then(() => {
              bot.sendMessage(chatId, 'Forwarded messages to the destination chat');
            })
            .catch((error) => {
              bot.sendMessage(chatId, 'Error forwarding messages. Please try again later.');
              console.error('Error forwarding messages:', error);
            });
        });
      });
    });
  });
});

bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  if (isForwarding) {
    isForwarding = false;
    await bot.sendMessage(chatId, 'Forwarding process canceled.');
  } else {
    await bot.sendMessage(chatId, 'No forwarding process is currently ongoing.');
  }
});

function saveAuthorizedUsers() {
  const data = JSON.stringify(authorizedUsers, null, 2);
  fs.writeFileSync('authorized_users.json', data, 'utf8');
}

// Bot shutdown event handler to save authorized user data
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
  saveAuthorizedUsers();
});

process.on('SIGINT', () => {
  saveAuthorizedUsers();
  process.exit();
});

console.log('Bot is running...');

function parseIntegerMessage(message) {
  const parsedValue = parseInt(message.text.trim());
  return isNaN(parsedValue) ? NaN : parsedValue;
}
