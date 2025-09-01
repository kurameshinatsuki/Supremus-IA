// index.js - reply-to detection via cache + robust mentions + sticker conversion (sharp) + proper quoting
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const { nazunaReply } = require('./nazunaAI');

const DEBUG = (process.env.DEBUG === 'true') || false;
let pair = false;

/**
 * Petit utilitaire CLI (pairing code)
 */
function ask(questionText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(questionText, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

/* =========================
 *        COMMANDES
 * ========================= */
async function handleCommand(command, args, msg, sock) {
  const commandName = (command || '').toLowerCase();

  switch (commandName) {
    case 'tagall':
      return handleTagAll(msg, sock);
    case 'help':
      return (
        "📚 Commandes disponibles :\n" +
        "• /tagall - Mentionne tous les membres du groupe\n" +
        "• /help - Affiche ce message d'aide"
      );
    default:
      return null;
  }
}

/**
 * /tagall - mentionne tout le monde (groupes seulement)
 * On renvoie aussi en citant le message source.
 */
async function handleTagAll(msg, sock) {
  const jid = msg.key.remoteJid;
  if (!jid.endsWith('@g.us')) {
    return "❌ Cette commande n'est disponible que dans les groupes.";
  }

  try {
    const groupMetadata = await sock.groupMetadata(jid);
    const participants = groupMetadata.participants || [];

    const mentions = [];
    let mentionText = '';

    participants.forEach(p => {
      if (p.id !== sock.user.id) {
        mentions.push(p.id);
        mentionText += `@${String(p.id).split('@')[0]} `;
      }
    });

    await sock.sendMessage(
      jid,
      { text: `📢 Mention de tous les membres :\n${mentionText}`, mentions },
      { quoted: msg } // ✅ la citation correcte est ici (3ᵉ param)
    );

    return null;
  } catch (error) {
    console.error('❌ Erreur lors du /tagall:', error);
    return "❌ Une erreur est survenue lors de la mention des membres.";
  }
}

/* =========================
 *         HELPERS
 * ========================= */
function normalizeLocal(jid = '') {
  return String(jid || '').split('@')[0];
}

function jidEquals(a, b) {
  if (!a || !b) return false;
  return normalizeLocal(a) === normalizeLocal(b);
}

/**
 * Récupère le texte d'un message cité (si présent)
 */
function extractTextFromQuoted(contextInfo = {}) {
  const qm = contextInfo?.quotedMessage || {};
  return (
    qm?.conversation ||
    qm?.extendedTextMessage?.text ||
    null
  );
}

/**
 * Type de message (texte, image, etc.)
 */
function getMessageType(msg) {
  if (!msg || !msg.message) return null;
  return Object.keys(msg.message)[0];
}

/**
 * Récupère un texte lisible d'un WAMessage (caption inclus)
 */
function extractText(msg) {
  if (!msg || !msg.message) return '';
  const m = msg.message;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  return '';
}

/**
 * Log lisible pour debug
 */
function prettyLog(msg) {
  const key = msg.key || {};
  const remote = key.remoteJid || 'unknown';
  const isGroup = remote.endsWith('@g.us');
  const participant = key.participant || remote;
  const pushName = msg.pushName || msg.notifyName || 'unknown';
  const msgType = getMessageType(msg) || 'unknown';
  const body = extractText(msg) || '[non-textuel]';
  const timestamp = msg.messageTimestamp
    ? new Date(msg.messageTimestamp * 1000).toLocaleString()
    : new Date().toLocaleString();
  const context = msg.message?.extendedTextMessage?.contextInfo || {};
  const mentions = Array.isArray(context?.mentionedJid) ? context.mentionedJid : [];
  const quoted = context?.quotedMessage
    ? (context.quotedMessage.conversation || '[message cité non textuel]')
    : null;

  console.log('\n==========================');
  console.log('📩 Nouveau message —', timestamp);
  console.log('👥 Chat   :', remote, isGroup ? '(Groupe)' : '(Privé)');
  console.log('👤 From   :', participant, '| pushName:', pushName);
  console.log('📦 Type   :', msgType);
  console.log('📝 Texte  :', body);
  if (mentions.length) console.log('🔔 Mentions:', mentions.join(', '));
  if (quoted) console.log('❝ Quoted :', quoted);
  console.log('🧷 stanzaId:', key.id, '| participant:', key.participant || '(none)');
  console.log('==========================\n');
}

/**
 * Nettoie les caractères non alphanumériques initiaux
 */
function stripLeadingNonAlnum(s = '') {
  if (!s) return '';
  try {
    return String(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
  } catch (e) {
    return String(s).replace(/^[^a-zA-Z0-9]+/, '').trim();
  }
}

/**
 * Stickers aléatoires (optionnel)
 */
async function getRandomSticker() {
  try {
    const stickersDir = path.join(__dirname, 'stickers');
    if (!fs.existsSync(stickersDir)) return null;

    const files = fs.readdirSync(stickersDir).filter(f => /\.(webp|png|jpe?g)$/i.test(f));
    if (files.length === 0) return null;

    const randomFile = files[Math.floor(Math.random() * files.length)];
    const inputPath = path.join(stickersDir, randomFile);

    if (/\.webp$/i.test(randomFile)) return inputPath;

    const outputPath = inputPath.replace(/\.(png|jpe?g)$/i, '.webp');
    if (!fs.existsSync(outputPath)) {
      try {
        await sharp(inputPath)
          .resize({ width: 512, height: 512, fit: 'inside' })
          .webp({ quality: 90 })
          .toFile(outputPath);
        console.log(`🔄 Conversion ${randomFile} → ${path.basename(outputPath)}`);
      } catch (err) {
        console.error('⚠️ Erreur de conversion en webp:', err?.message || err);
        return null;
      }
    }
    return outputPath;
  } catch (err) {
    console.error('⚠️ Impossible de charger les stickers:', err?.message || err);
    return null;
  }
}

/* =========================
 *   CACHE DES MSG DU BOT
 * ========================= */
const botMessageCache = new Map();

/**
 * Mémorise les derniers textes envoyés par le bot dans un chat
 * pour détecter si un utilisateur répond à l’un d’eux.
 */
function cacheBotReply(chatId, text) {
  if (!chatId || !text) return;
  const arr = botMessageCache.get(chatId) || [];
  const t = String(text || '').trim();
  arr.unshift({ text: t, ts: Date.now() });

  const stripped = stripLeadingNonAlnum(t);
  if (stripped && stripped !== t) arr.unshift({ text: stripped, ts: Date.now() });

  while (arr.length > 160) arr.pop();
  botMessageCache.set(chatId, arr);
  if (DEBUG) {
    console.log('🐛 DEBUG cacheBotReply:', chatId, '=>', arr.slice(0, 6).map(i => i.text));
  }
}

/**
 * Vérifie si le texte cité correspond à un des derniers messages du bot
 */
function quotedMatchesBot(chatId, quotedText) {
  if (!chatId || !quotedText) return false;
  const arr = botMessageCache.get(chatId) || [];
  const q = String(quotedText || '').trim();
  const qStripped = stripLeadingNonAlnum(q);
  const qLower = q.toLowerCase();
  const qStrippedLower = qStripped.toLowerCase();

  const found = arr.some(item => {
    const it = String(item.text || '').trim().toLowerCase();
    return it === qLower || it === qStrippedLower;
  });

  if (DEBUG) {
    console.log('🐛 DEBUG quotedMatchesBot:', { chatId, quotedText: q, stripped: qStripped, found });
  }
  return found;
}

/* =========================
 *   ENVOI AVEC CITATION
 * ========================= */
/**
 * Envoie une réponse en citant *toujours* le message d’origine.
 * NOTE: `quoted` doit être dans les *options* (3ᵉ paramètre) avec Baileys.
 */
async function sendReply(sock, msg, contentObj, optionsExtra = {}) {
  const jid = msg.key.remoteJid;
  const opts = { quoted: msg, ...optionsExtra };
  console.log('🧷 sendReply -> quoting stanzaId:', msg.key.id, '| to:', jid);
  return sock.sendMessage(jid, contentObj, opts);
}

/* =========================
 *  HANDLER PRINCIPAL
 * ========================= */
async function startBot(sock, state) {
  let BOT_JID = (sock.user && sock.user.id) || (state?.creds?.me?.id) || process.env.BOT_JID || null;

  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open' && sock.user?.id) {
      BOT_JID = sock.user.id;
      console.log('✅ Connexion ouverte — Bot JID:', BOT_JID);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages && messages[0];
      if (!msg || !msg.message) return;
      prettyLog(msg);

      // Si c'est le bot qui parle → on met en cache et on sort
      if (msg.key.fromMe) {
        const text = extractText(msg);
        if (text) cacheBotReply(msg.key.remoteJid, text);
        return;
      }

      const text = extractText(msg);
      if (!text) return;

      const remoteJid = msg.key.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');

      // Si l’utilisateur répond à un message du bot
      const quotedText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
        ? extractTextFromQuoted(msg.message.extendedTextMessage.contextInfo)
        : null;
      const isReplyToBot = quotedText && quotedMatchesBot(remoteJid, quotedText);

      // Mention du bot (via @numéro ou via liste mentions)
      const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const botNumber = process.env.BOT_NUMBER?.replace(/[^0-9]/g, '') || '111536592965872'; // ← adapte ici
      const isMentioned =
        mentionedJids.some(jid => jid.includes(botNumber)) ||
        (text && text.includes('@' + botNumber)) ||
        (text && text.toLowerCase().includes('supremia'));

      // Commande ?
      const isCommand = text.startsWith('/');

      // Décision :
      // - privé => toujours répondre
      // - groupe => répondre si commande, mention, ou reply-to-bot
      const shouldReply = !isGroup || isCommand || isReplyToBot || isMentioned;

      console.log(
        `📌 Decision: shouldReply=${shouldReply} | isGroup=${isGroup} | isCommand=${isCommand} | isReplyToBot=${isReplyToBot} | isMentioned=${isMentioned}`
      );

      if (!shouldReply) return;

      try {
        let reply = null;

        // 1) commandes
        if (isCommand) {
          const [command, ...args] = text.slice(1).trim().split(/\s+/);
          reply = await handleCommand(command, args, msg, sock);
          if (reply) {
            await sendReply(sock, msg, { text: reply });
            cacheBotReply(remoteJid, reply);
            return;
          }
        }

        // 2) IA (mention / reply / privé)
        const senderJid = msg.key.participant || remoteJid;
        console.log(`🤖 IA: génération de réponse pour ${senderJid} dans ${remoteJid}`);
        reply = await nazunaReply(text, senderJid, remoteJid);

        if (reply) {
          await sendReply(sock, msg, { text: reply });
          cacheBotReply(remoteJid, reply);
        }

        // 3) bonus sticker de temps en temps (sans citation volontairement)
        if (!isCommand && Math.random() < 0.2) {
          const stickerPath = await getRandomSticker();
          if (stickerPath) {
            await sock.sendMessage(remoteJid, { sticker: { url: stickerPath } });
          }
        }
      } catch (error) {
        console.error('❌ Erreur lors du traitement du message:', error);
        await sendReply(sock, msg, { text: '❌ Désolé, une erreur est survenue. Veuillez réessayer plus tard.' });
      }
    } catch (err) {
      console.error('❌ Erreur dans messages.upsert handler:', err);
    }
  });
}

/* =========================
 *         MAIN
 * ========================= */
async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    getMessage: async key => {
      console.log('⚠️ Message non déchiffré, retry demandé:', key);
      return { conversation: '🔄 Réessaye d\'envoyer ton message' };
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Pairing code (si non enregistré)
  if (!sock.authState.creds.registered && !pair) {
    try {
      await delay(3000);
      const number = process.env.BOT_NUMBER || await ask('Entrez le numéro WhatsApp (ex: 22898133388) : ');
      const code = await sock.requestPairingCode(number);
      console.log('🔗 PAIR-CODE : ', code);
      pair = true;
      console.log('📱 Va dans WhatsApp > Paramètres > Appareils liés > Lier avec le code');
    } catch (err) {
      console.error('❌ Erreur lors de la génération du pairing code :', err?.message || err);
    }
  }

  await startBot(sock, state);
}

main().catch(err => {
  console.error('💥 Erreur fatale:', err?.stack || err);
});

const express = require('express');
const app = express();
const port = process.env.PORT || 5000; // Assurez-vous d'ajouter cette ligne pour définir le port

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Supremus-IA by John Supremus</title>
        <style>
            /* Styles pour centrer le texte */
            body {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                font-family: Arial, sans-serif;
                background-color: #f0f0f0;
            }
            .content {
                text-align: center;
                padding: 20px;
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
        </style>
    </head>
    <body>
        <div class="content">
            <h1>Supremus IA est actif</h1>
        </div>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log("Listening on port: " + port);
});