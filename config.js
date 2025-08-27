'use strict';

// Charge les variables d'environnement depuis .env
require('dotenv').config();
const path = require('path');

/**
 * Configuration centrale du bot Nazuna
 * - Toutes les valeurs peuvent être surchargées via .env
 * - Fournit des valeurs par défaut sûres si la clé est absente
 */
const config = {
  // ⚙️ Paramètres généraux du bot
  bot: {
    name: process.env.BOT_NAME || 'Supremia',
    // JID du propriétaire (ex: 22554191184@s.whatsapp.net) – facultatif
    ownerJid: process.env.OWNER_JID || '22554191184@s.whatsapp.net',
    language: process.env.LANG || 'fr',
  },

  // 🤖 Moteur IA (Gemini par défaut)
  ai: {
    provider: process.env.AI_PROVIDER || 'gemini',
    // Modèle Gemini Flash
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    // Clé API Gemini — DOIT être définie dans .env
    apiKey: process.env.GEMINI_API_KEY || 'AIzaSyAOgSPj1NU_XGE7VkVkCXSfksI5wo7C_co',
    // Style de personnalité ("human-like", "cute", "serious", etc.)
    persona: process.env.PERSONA || 'serious',
    temperature: Number(process.env.AI_TEMPERATURE || 1.0),
maxOutputTokens: Number(process.env.AI_MAX_TOKENS || 8192),
  },

  // 📲 WhatsApp / Baileys
  whatsapp: {
    // Dossier de session Baileys
    sessionDir: process.env.SESSION_DIR || path.join(process.cwd(), 'session'),
    // Numéro pour le code d'appairage (facultatif si saisi dans la console)
    pairingNumber: process.env.WA_NUMBER || '22554191184',
    // Chaîne d'agent navigateur (facultatif)
    browser: [
      process.env.WA_BROWSER_NAME || 'Ubuntu',
      process.env.WA_BROWSER_BUILD || 'Chrome',
      process.env.WA_BROWSER_VERSION || '20.0.04',
    ],
  },

  // 🖼️ Stickers
  stickers: {
    dir: process.env.STICKERS_DIR || path.join(process.cwd(), 'stickers'),
    // Envoyer un sticker aléatoire avec chaque réponse
    sendWithReplies: (process.env.SEND_STICKER || 'true').toLowerCase() === 'true',
  },

  // 🧾 Logs
  logging: {
    level: process.env.LOG_LEVEL || 'debug', // debug | info | warn | error
    pretty: (process.env.LOG_PRETTY || 'true').toLowerCase() === 'true',
  },
};

module.exports = config;
