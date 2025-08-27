// index.js - detection reply-to bot via cache + robust mentions + sticker conversion (sharp)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { nazunaReply } = require('./nazunaAI');

const DEBUG = (process.env.DEBUG === 'true') || false;
let pair = false;

function ask(questionText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(questionText, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

// -------- command handlers --------
async function handleCommand(command, args, msg, sock) {
  const commandName = command.toLowerCase();

  switch(commandName) {
    case 'tagall':
      return handleTagAll(msg, sock);
    case 'help':
      return "📚 Commandes disponibles :\n" +
             "• /tagall - Mentionne tous les membres du groupe\n" +
             "• /help - Affiche ce message d'aide";
    default:
      return null; // Commande non reconnue
  }
}

async function handleTagAll(msg, sock) {
  if (!msg.key.remoteJid.endsWith('@g.us')) {
    return "❌ Cette commande n'est disponible que dans les groupes.";
  }

  try {
    const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
    const participants = groupMetadata.participants;

    // Crée une liste des mentions
    const mentions = [];
    let mentionText = '';

    participants.forEach(participant => {
      // Ne pas mentionner le bot lui-même
      if (participant.id !== sock.user.id) {
        mentions.push(participant.id);
        mentionText += `@${participant.id.split('@')[0]} `;
      }
    });

    // Envoie le message avec les mentions
    await sock.sendMessage(msg.key.remoteJid, {
      text: `📢 Mention de tous les membres :\n${mentionText}`,
      mentions: mentions
    });

    return null; // On a déjà envoyé le message, pas besoin de réponse
  } catch (error) {
    console.error('Erreur lors du tagall:', error);
    return "❌ Une erreur est survenue lors de la mention des membres.";
  }
}

// -------- helpers --------
function normalizeLocal(jid = '') {
  // retourne la partie avant @ (ex: 22912345678 pour 22912345678@lid ou @s.whatsapp.net)
  return String(jid || '').split('@')[0];
}
function jidEquals(a, b) {
  if (!a || !b) return false;
  return normalizeLocal(a) === normalizeLocal(b);
}
function extractTextFromQuoted(contextInfo = {}) {
  // quotedMessage peut contenir conversation ou extendedTextMessage
  const qm = contextInfo?.quotedMessage || {};
  return qm?.conversation || qm?.extendedTextMessage?.text || null;
}
function getMessageType(msg) {
  if (!msg || !msg.message) return null;
  return Object.keys(msg.message)[0];
}
function extractText(msg) {
  if (!msg || !msg.message) return '';
  const m = msg.message;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  return '';
}
function prettyLog(msg) {
  const key = msg.key || {};
  const remote = key.remoteJid || 'unknown';
  const isGroup = remote.endsWith('@g.us');
  const participant = key.participant || remote;
  const pushName = msg.pushName || msg.notifyName || 'unknown';
  const msgType = getMessageType(msg) || 'unknown';
  const body = extractText(msg) || '[non-textuel]';
  const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toLocaleString() : new Date().toLocaleString();
  const context = msg.message?.extendedTextMessage?.contextInfo || {};
  const mentions = Array.isArray(context?.mentionedJid) ? context.mentionedJid : [];
  const quoted = context?.quotedMessage ? (context.quotedMessage.conversation || '[message cité non textuel]') : null;

  console.log('\n==========================');
  console.log('📩 Nouveau message —', timestamp);
  console.log('👥 Chat   :', remote, isGroup ? '(Groupe)' : '(Privé)');
  console.log('👤 From   :', participant, '| pushName:', pushName);
  console.log('📦 Type   :', msgType);
  console.log('📝 Texte  :', body);
  if (mentions.length) console.log('🔔 Mentions:', mentions.join(', '));
  if (quoted) console.log('❝ Quoted :', quoted);
  console.log('==========================\n');
}

// retire préfixes emoji/ponctuation (pour matcher le texte cité plus facilement)
function stripLeadingNonAlnum(s = '') {
  if (!s) return '';
  try {
    // enlève caractères initiaux non lettres/chiffres (emoji, symboles, espaces)
    return String(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
  } catch (e) {
    // fallback simple si engine RegExp ne supporte pas \p
    return String(s).replace(/^[^a-zA-Z0-9]+/, '').trim();
  }
}

// -------- sticker helper (async, conversion and cache) --------
async function getRandomSticker() {
  try {
    const stickersDir = path.join(__dirname, 'stickers');
    if (!fs.existsSync(stickersDir)) return null;

    const files = fs.readdirSync(stickersDir).filter(f =>
      /\.(webp|png|jpe?g)$/i.test(f)
    );
    if (files.length === 0) return null;

    const randomFile = files[Math.floor(Math.random() * files.length)];
    const inputPath = path.join(stickersDir, randomFile);

    if (/\.webp$/i.test(randomFile)) return inputPath;

    const outputPath = inputPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    if (!fs.existsSync(outputPath)) {
      try {
        await sharp(inputPath)
          .resize({ width: 512, height: 512, fit: 'inside' })
          .webp({ quality: 90 })
          .toFile(outputPath);
        console.log(`🔄 Conversion ${randomFile} → ${path.basename(outputPath)}`);
      } catch (err) {
        console.error("⚠️ Erreur de conversion en webp:", err && err.message ? err.message : err);
        return null;
      }
    }
    return outputPath;
  } catch (err) {
    console.error("⚠️ Impossible de charger les stickers:", err && err.message ? err.message : err);
    return null;
  }
}

// -------- bot message cache (pour detection reply-to) --------
// Structure: Map<chatId, Array<{text, ts}>>
const botMessageCache = new Map();
function cacheBotReply(chatId, text) {
  if (!chatId || !text) return;
  const arr = botMessageCache.get(chatId) || [];
  const t = String(text || '').trim();
  arr.unshift({ text: t, ts: Date.now() });

  // aussi stocker version "stripped" (sans emoji/prefix) pour matching quotes qui perdent emoji
  const stripped = stripLeadingNonAlnum(t);
  if (stripped && stripped !== t) arr.unshift({ text: stripped, ts: Date.now() });

  while (arr.length > 160) arr.pop(); // laisse un peu plus d'historique
  botMessageCache.set(chatId, arr);
  if (DEBUG) {
    console.log('DEBUG cacheBotReply:', chatId, '=>', arr.slice(0,6).map(i => i.text));
  }
}
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
    console.log('DEBUG quotedMatchesBot:', { chatId, quotedText: q, stripped: qStripped, found });
  }
  return found;
}

// -------- main message handler --------
async function startBot(sock, state) {
  // resolve bot id fallback
  let BOT_JID = (sock.user && sock.user.id) || (state?.creds?.me?.id) || process.env.BOT_JID || null;
  if (BOT_JID) console.log('🤖 Bot JID initial (fallback):', BOT_JID);

  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open' && sock.user?.id) {
      BOT_JID = sock.user.id;
      console.log('✅ Connexion ouverte — Bot JID:', BOT_JID);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages && messages[0];
      if (!msg) return;

      if (!msg.message) {
        if (DEBUG) console.log('⚠️ Message sans payload reçu — ignoré.');
        return;
      }

      // Log le message reçu (debug)
      prettyLog(msg);

      // Vérifie si c'est un message du bot lui-même
      if (msg.key.fromMe) {
        // Si c'est un message du bot, on le met en cache
        const text = extractText(msg);
        if (text) cacheBotReply(msg.key.remoteJid, text);
        return;
      }

      // Récupère les métadonnées du groupe si c'est un groupe
      let groupMetadata = {};
      if (msg.key.remoteJid.endsWith('@g.us')) {
        try {
          groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
        } catch (err) {
          console.error('Erreur récupération métadonnées groupe:', err);
        }
      }

      // Vérifie si c'est un message cité (reply)
      const quotedText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage ? 
        extractTextFromQuoted(msg.message.extendedTextMessage.contextInfo) : null;

      // Détecte si c'est une réponse à un message du bot
      const isReplyToBot = quotedText && quotedMatchesBot(msg.key.remoteJid, quotedText);

      // Vérifie si le bot est mentionné (pour les groupes) ou si c'est un message privé
      const isMentioned = msg.key.remoteJid.endsWith('@g.us') ? 
        msg.message.extendedTextMessage?.text?.includes('@' + sock.user.id.split('@')[0]) : true;

      // Récupère le texte du message
      const text = extractText(msg);
      if (!text) return;

      // Vérifie si c'est une commande (commence par /)
      const isCommand = text.startsWith('/');

      // Si c'est une commande ou une réponse au bot ou une mention, on traite le message
      if (isCommand || isReplyToBot || isMentioned) {
        try {
          let reply = null;

          // Si c'est une commande, on la traite
          if (isCommand) {
            const [command, ...args] = text.slice(1).split(/\s+/);
            reply = await handleCommand(command, args, msg, sock);
          }

          // Si ce n'est pas une commande ou si la commande n'a pas été reconnue
          // et que c'est une réponse au bot ou une mention, on utilise l'IA
          if ((!isCommand || reply === null) && (isReplyToBot || isMentioned)) {
            reply = await nazunaReply(text, msg.key.remoteJid);
          }

          // Envoie la réponse si elle existe
          if (reply) {
            await sock.sendMessage(msg.key.remoteJid, { text: reply });
            // Met en cache la réponse du bot
            cacheBotReply(msg.key.remoteJid, reply);
          }

          // Envoie un sticker aléatoire de temps en temps (50% de chance)
          // Sauf si c'était une commande (pour éviter les réponses multiples)
          if (!isCommand && Math.random() < 0.5) {
            const stickerPath = await getRandomSticker();
            if (stickerPath) {
    await sock.sendMessage(msg.key.remoteJid, {
        sticker: { url: stickerPath }
    });
        }
          }
        } catch (error) {
          console.error('Erreur lors du traitement du message:', error);
          await sock.sendMessage(msg.key.remoteJid, { 
            text: '❌ Désolé, une erreur est survenue. Veuillez réessayer plus tard.' 
          });
        }
      }
    } catch (err) {
      console.error('❌ Erreur dans messages.upsert handler:', err && err.stack ? err.stack : err);
    }
  });
}

// -------- main avec meilleure gestion de connexion --------
async function main() {
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    
    const sockOptions = {
      version,
      printQRInTerminal: true,
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, console),
      },
      getMessage: async key => {
        console.log("⚠️ Message non déchiffré, retry demandé:", key);
        return { conversation: "🔄 Réessaye d'envoyer ton message" };
      }
    };

    let sock = makeWASocket(sockOptions);

    // Système de pairing si non enregistré
    if (!sock.authState.creds.registered && !pair) {
      try {
        await delay(3000);
        const number = process.env.NUMERO_OWNER || "22540718560";
        const code = await sock.requestPairingCode(number);
        console.log("🔗 PAIR-CODE : ", code);
        pair = true;
      } catch (err) {
        console.error("❌ Erreur pairing code :", err.message);
      }
    }

    // Mise à jour des credentials
    sock.ev.on("creds.update", saveCreds);

    // Gestion des événements de connexion
    sock.ev.on("connection.update", async (con) => {
      const { lastDisconnect, connection, receivedPendingNotifications } = con;
      
      if (connection === "connecting") {
        console.log("ℹ️ Connexion en cours...");
      } else if (connection === 'open') {
        console.log("✅ Connexion réussie! ☺️");
        console.log("Le bot est en ligne 🕸\n\n");
        
        // Démarrer le bot
        await startBot(sock, state);
      } else if (connection == "close") {
        let raisonDeconnexion = new Boom(lastDisconnect?.error)?.output.statusCode;
        
        if (raisonDeconnexion === DisconnectReason.badSession) {
          console.log('Session id érronée veuillez rescanner le qr svp ...');
        } else if (raisonDeconnexion === DisconnectReason.connectionClosed) {
          console.log('!!! connexion fermée, reconnexion en cours ...');
          setTimeout(main, 5000);
        } else if (raisonDeconnexion === DisconnectReason.connectionLost) {
          console.log('connexion au serveur perdue 😞 ,,, reconnexion en cours ... ');
          setTimeout(main, 5000);
        } else if (raisonDeconnexion === DisconnectReason.connectionReplaced) {
          console.log('connexion réplacée ,,, une sesssion est déjà ouverte veuillez la fermer svp !!!');
        } else if (raisonDeconnexion === DisconnectReason.loggedOut) {
          console.log('vous êtes déconnecté,,, veuillez rescanner le code qr svp');
        } else if (raisonDeconnexion === DisconnectReason.restartRequired) {
          console.log('redémarrage en cours ▶️');
          setTimeout(main, 5000);
        } else {
          console.log('Redémarrage sur le coup de l\'erreur:', raisonDeconnexion);
          setTimeout(main, 5000);
        }
      }
    });

  } catch (err) {
    console.error('❌ Erreur lors de l\'initialisation:', err);
    setTimeout(main, 10000); // Réessayer après 10 secondes
  }
}

// Démarrer le bot avec un délai initial
setTimeout(() => {
  main().catch(err => {
    console.error('Erreur fatale:', err && err.stack ? err.stack : err);
  });
}, 2000);