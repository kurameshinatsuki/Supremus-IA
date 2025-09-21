'use strict';
require('dotenv').config();
const path = require('path');

const config = {
  bot: {
    name: process.env.BOT_NAME || 'Supremia',
    ownerJid: process.env.OWNER_JID || '177958127927437@lid',
    language: process.env.LANG || 'fr',
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'gemini',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    apiKey: process.env.GEMINI_API_KEY || 'AIzaSyAOgSPj1NU_XGE7VkVkCXSfksI5wo7C_co',
    persona: process.env.PERSONA || 'serious',
    temperature: Number(process.env.AI_TEMPERATURE || 0.4),
    maxOutputTokens: Number(process.env.AI_MAX_TOKENS || 512),
  },

  whatsapp: {
    sessionDir: process.env.SESSION_DIR || path.join(process.cwd(), 'session'),
    pairingNumber: process.env.WA_NUMBER || '22554191184',
    browser: [
      process.env.WA_BROWSER_NAME || 'Ubuntu',
      process.env.WA_BROWSER_BUILD || 'Chrome',
      process.env.WA_BROWSER_VERSION || '20.0.04',
    ],
  },

  stickers: {
    dir: process.env.STICKERS_DIR || path.join(process.cwd(), 'stickers'),
    sendWithReplies: (process.env.SEND_STICKER || 'true').toLowerCase() === 'true',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    pretty: (process.env.LOG_PRETTY || 'true').toLowerCase() === 'true',
  },
};

// Validation de la clé API
if (!config.ai.apiKey || config.ai.apiKey.trim() === '') {
  console.warn('⚠️  GEMINI_API_KEY non définie dans .env');
} else if (config.ai.apiKey.includes('AIzaSy')) {
  console.warn('⚠️  Utilisation d\'une clé API par défaut - configurez une vraie clé');
}

module.exports = config;