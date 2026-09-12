const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'telegram_config.json');

// In-memory data store
let config = {
  botToken: '',
  chatId: '',
  autoDetectChatId: true
};

// Sessions: { [sessionId]: { id, name, lastActive, messages: [ { id, text, sender: 'visitor'|'agent', timestamp } ] } }
const sessions = {};
// Mapping telegram message ID to sessionId
const telegramMsgMap = {}; // { [telegramMessageId]: sessionId }
let lastActiveSessionId = null;
let telegramOffset = 0;
let isPolling = false;
let botInfo = null;

// Load config from file
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = { ...config, ...data };
      if (config.botToken) {
        config.botToken = config.botToken.trim();
      }
      if (config.chatId) {
        config.chatId = String(config.chatId).trim();
      }
    }
  } catch (err) {
    console.error('Error loading telegram_config.json:', err.message);
  }
}

// Save config to file
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving telegram_config.json:', err.message);
  }
}

// Telegram API Helper using native HTTPS
function telegramApi(method, data = {}) {
  return new Promise((resolve, reject) => {
    if (!config.botToken) {
      return reject(new Error('Bot token is not configured'));
    }

    const postData = JSON.stringify(data);
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${config.botToken}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.ok) {
            resolve(parsed.result);
          } else {
            reject(new Error(parsed.description || 'Telegram API error'));
          }
        } catch (e) {
          reject(new Error('Failed to parse Telegram response: ' + body));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

// Test bot token and fetch bot info
async function verifyBot() {
  if (!config.botToken) return false;
  try {
    botInfo = await telegramApi('getMe');
    console.log(`[Telegram] Connected as @${botInfo.username} (${botInfo.first_name})`);
    return true;
  } catch (err) {
    console.warn(`[Telegram] getMe failed: ${err.message}`);
    botInfo = null;
    return false;
  }
}

// Start Telegram Poller
async function startTelegramPolling() {
  if (isPolling) return;
  isPolling = true;

  const valid = await verifyBot();
  if (!valid) {
    isPolling = false;
    return;
  }

  console.log('[Telegram] Live polling started...');
  pollUpdates();
}

async function pollUpdates() {
  if (!config.botToken) {
    isPolling = false;
    return;
  }

  try {
    const updates = await telegramApi('getUpdates', {
      offset: telegramOffset,
      timeout: 25,
      allowed_updates: ['message', 'callback_query']
    });

    if (Array.isArray(updates)) {
      for (const update of updates) {
        telegramOffset = update.update_id + 1;
        await handleTelegramUpdate(update);
      }
    }
  } catch (err) {
    // Wait 3s before retrying on network or timeout issues
    await new Promise(r => setTimeout(r, 3000));
  }

  // Next poll loop
  setTimeout(pollUpdates, 500);
}

// Handle an incoming update from Telegram
async function handleTelegramUpdate(update) {
  const message = update.message;
  if (!message || !message.text) return;

  const text = message.text.trim();
  const chatId = String(message.chat.id);
  const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || 'Admin';

  // 1. Handle /start command
  if (text.startsWith('/start')) {
    config.chatId = chatId;
    saveConfig();
    console.log(`[Telegram] /start received. Chat ID set to: ${chatId}`);

    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: `🚀 *GrowthPilot Live Chat Bridge Connected!*\n\n` +
            `✅ *Chat ID:* \`${chatId}\` (Saved)\n` +
            `🟢 Status: *ONLINE & READY*\n\n` +
            `When website visitors send a message on your site, you will receive it here.\n\n` +
            `💡 *How to reply:* Simply use Telegram's *Reply* feature on any message to chat with that visitor directly in real time!`,
      parse_mode: 'Markdown'
    }).catch(console.error);
    return;
  }

  // 2. Handle /status command
  if (text.startsWith('/status')) {
    const sessionCount = Object.keys(sessions).length;
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: `📊 *GrowthPilot Bridge Status*\n\n` +
            `• Active Visitor Sessions: *${sessionCount}*\n` +
            `• Linked Chat ID: \`${config.chatId || 'Not set'}\`\n` +
            `• Last Active Visitor: \`${lastActiveSessionId || 'None'}\``,
      parse_mode: 'Markdown'
    }).catch(console.error);
    return;
  }

  // 3. Handle Admin replying to a visitor message
  let targetSessionId = null;

  if (message.reply_to_message) {
    const repliedMsgId = message.reply_to_message.message_id;
    targetSessionId = telegramMsgMap[repliedMsgId];
  }

  // If not a direct reply, fall back to last active session
  if (!targetSessionId && lastActiveSessionId && sessions[lastActiveSessionId]) {
    targetSessionId = lastActiveSessionId;
  }

  if (targetSessionId && sessions[targetSessionId]) {
    const agentMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      text: text,
      sender: 'agent',
      senderName: senderName,
      timestamp: Date.now()
    };

    sessions[targetSessionId].messages.push(agentMsg);
    sessions[targetSessionId].lastActive = Date.now();
    console.log(`[Telegram -> Web] Sent to ${targetSessionId}: "${text}"`);

    // Confirm in Telegram
    await telegramApi('sendMessage', {
      chat_id: chatId,
      reply_to_message_id: message.message_id,
      text: `✅ _Delivered to website visitor (${targetSessionId})_`,
      parse_mode: 'Markdown'
    }).catch(() => {});
  } else {
    // Notify admin how to reply
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: `ℹ️ *No active visitor found for this reply.*\n\nPlease reply directly to a specific visitor message, or wait until a new visitor chats on the website.`,
      parse_mode: 'Markdown'
    }).catch(() => {});
  }
}

// Forward visitor message from website to Telegram
async function forwardVisitorMessageToTelegram(sessionId, text, visitorName = 'Visitor') {
  if (!config.botToken || !config.chatId) {
    console.log('[Telegram Bridge] Not configured yet. Message saved locally.');
    return null;
  }

  try {
    const formatted = `💬 *New Live Chat Message*\n\n` +
                      `👤 *From:* ${visitorName} (\`${sessionId}\`)\n` +
                      `📝 *Message:*\n"${text}"\n\n` +
                      `_👉 Swipe/Click 'Reply' on this message to answer this visitor directly!_`;

    const res = await telegramApi('sendMessage', {
      chat_id: config.chatId,
      text: formatted,
      parse_mode: 'Markdown'
    });

    if (res && res.message_id) {
      telegramMsgMap[res.message_id] = sessionId;
      return res.message_id;
    }
  } catch (err) {
    console.error('[Telegram Bridge] Failed to forward message:', err.message);
  }
  return null;
}

// Static file MIME map
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf'
};

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API ROUTES ---

  // 1. GET /api/status - Get Telegram configuration & bot state
  if (pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configured: !!(config.botToken && config.chatId),
      botTokenSet: !!config.botToken,
      chatIdSet: !!config.chatId,
      chatId: config.chatId ? `${config.chatId.slice(0, 3)}***${config.chatId.slice(-2)}` : '',
      botUsername: botInfo ? botInfo.username : null,
      botName: botInfo ? botInfo.first_name : null
    }));
    return;
  }

  // 2. POST /api/config - Save & verify Telegram bot settings
  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        if (payload.botToken !== undefined) config.botToken = payload.botToken.trim();
        if (payload.chatId !== undefined) config.chatId = String(payload.chatId).trim();
        
        saveConfig();

        const valid = await verifyBot();
        if (valid) {
          startTelegramPolling();
          if (config.chatId) {
            // Send test ping to Telegram
            await telegramApi('sendMessage', {
              chat_id: config.chatId,
              text: `🟢 *GrowthPilot Telegram Live Chat Connected!*\n\nBot is ready to receive and reply to website messages.`,
              parse_mode: 'Markdown'
            }).catch(() => {});
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          valid: valid,
          botUsername: botInfo ? botInfo.username : null,
          configured: !!(config.botToken && config.chatId)
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. POST /api/chat/send - Visitor sends message from website
  if (pathname === '/api/chat/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { sessionId, text, visitorName } = JSON.parse(body);
        if (!sessionId || !text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing sessionId or text' }));
          return;
        }

        if (!sessions[sessionId]) {
          sessions[sessionId] = {
            id: sessionId,
            name: visitorName || 'Visitor',
            lastActive: Date.now(),
            messages: []
          };
        }

        const msgObj = {
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          text: text,
          sender: 'visitor',
          visitorName: visitorName || 'Visitor',
          timestamp: Date.now()
        };

        sessions[sessionId].messages.push(msgObj);
        sessions[sessionId].lastActive = Date.now();
        lastActiveSessionId = sessionId;

        // Forward to Telegram
        const telegramMsgId = await forwardVisitorMessageToTelegram(sessionId, text, visitorName);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: msgObj,
          telegramDelivered: !!telegramMsgId,
          configured: !!(config.botToken && config.chatId)
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. GET /api/chat/poll - Visitor checks for new messages/replies
  if (pathname === '/api/chat/poll' && req.method === 'GET') {
    const sessionId = parsedUrl.query.sessionId;
    const after = parseInt(parsedUrl.query.after || '0', 10);

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing sessionId' }));
      return;
    }

    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        id: sessionId,
        name: 'Visitor',
        lastActive: Date.now(),
        messages: []
      };
    }

    const newMessages = sessions[sessionId].messages.filter(m => m.timestamp > after);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      sessionId,
      messages: newMessages,
      serverTime: Date.now()
    }));
    return;
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for root navigation
      filePath = path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

// Initialize and start server
loadConfig();
server.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 GrowthPilot Fullstack Server running on http://localhost:${PORT}`);
  console.log(`=======================================================`);

  if (config.botToken) {
    const ok = await verifyBot();
    if (ok) {
      startTelegramPolling();
    }
  } else {
    console.log(`ℹ️ Telegram Bot Token not set yet.`);
    console.log(`👉 Open http://localhost:${PORT} to enter Bot Token & Chat ID via the Setup Modal.`);
  }
});
