// index.js - Version corrigée avec identification du propriétaire dans les groupes
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');
const { default: makeWASocket, useMultiFileAuthState, delay, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { nazunaReply, resetConversationMemory } = require('./nazunaAI');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { syncDatabase } = require('./models');
const { detecterVisuel } = require('./visuels');

const DEBUG = (process.env.DEBUG === 'true') || false;
let pair = false;

// Initialisation de la base de données
syncDatabase().then(() => {
  console.log('✅ Base de données PostgreSQL initialisée');
}).catch(err => {
  console.error('❌ Erreur initialisation base de données:', err);
});

// Système de rate limiting
const messageLimiter = new Map();
const lastInteraction = new Map();

/**
 * Vérifie si un utilisateur peut envoyer un message (rate limiting)
 */
function checkRateLimit(jid, cooldown = 3000) {
  const now = Date.now();
  const lastMessage = messageLimiter.get(jid) || 0;
  
  if (now - lastMessage < cooldown) { return false; }
  messageLimiter.set(jid, now);
  return true;
}

/**
 * Petit utilitaire CLI (pairing code)
 */
function ask(questionText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Vérifie si l'expéditeur est le propriétaire du bot
 */
function isBotOwner(senderJid) {
  const botOwner = process.env.BOT_OWNER;
  if (!botOwner) {
    console.error('❌ BOT_OWNER non défini dans les variables d\'environnement');
    return false;
  }
  
  // Normaliser les JID pour la comparaison
  const normalizeJid = (jid) => {
    if (!jid) return '';
    // Supprimer le suffixe après @ et garder uniquement le numéro
    return jid.replace(/@.*/, '');
  };
  
  return normalizeJid(senderJid) === normalizeJid(botOwner);
}

/**
 * Vérifie si l'expéditeur est admin du groupe
 */
async function isUserAdmin(jid, participant, sock) {
  try {
    const metadata = await sock.groupMetadata(jid);
    const admins = metadata.participants.filter(p => p.admin !== null).map(p => p.id);
    return admins.includes(participant);
  } catch (error) {
    console.error('Erreur vérification admin:', error);
    return false;
  }
}

async function handleCommand(command, args, msg, sock) {
  const commandName = (command || '').toLowerCase();
  
  switch (commandName) {
    case 'tagall':
      return handleTagAll(msg, sock);
    case 'reset':
      return handleReset(msg, sock);
    case 'help':
      return (
        "📚 Commandes disponibles :\n" +
        "• /tagall - Mentionne tous les membres du groupe (admin seulement)\n" +
        "• /reset - Réinitialise l'historique de la conversation\n" +
        "• /help - Affiche ce message d'aide"
      );
    default:
      return null;
  }
}

/**
 * /tagall - mentionne tout le monde (groupes seulement, admin seulement)
 */
async function handleTagAll(msg, sock) {
  const jid = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  
  if (!jid.endsWith('@g.us')) {
    return "❌ Cette commande n'est disponible que dans les groupes.";
  }
  
  // Vérifier si l'utilisateur est admin ou propriétaire du bot
  const isAdmin = await isUserAdmin(jid, sender, sock);
  const isOwner = isBotOwner(sender);
  
  if (!isAdmin && !isOwner) {
    return "❌ Seuls les administrateurs peuvent utiliser cette commande.";
  }
  
  try {
    const groupMetadata = await sock.groupMetadata(jid);
    const participants = groupMetadata.participants || [];
    
    let mentionText = "🔔 Mention de tous les membres :\n\n";
    participants.forEach((participant, index) => {
      mentionText += `@${participant.id.replace('@s.whatsapp.net', '')} `;
      if ((index + 1) % 5 === 0) mentionText += "\n";
    });
    
    await sock.sendMessage(jid, { 
      text: mentionText,
      mentions: participants.map(p => p.id)
    });
    
    return null;
  } catch (error) {
    console.error('❌ Erreur lors du /tagall:', error);
    return "❌ Une erreur est survenue lors de la mention des membres.";
  }
}

/**
 * /reset - réinitialise l'historique de la conversation
 */
async function handleReset(msg, sock) {
  const jid = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  
  // Vérifier si l'utilisateur est le propriétaire du bot
  const isOwner = isBotOwner(sender);
  
  if (!isOwner) {
    // Pour les groupes, vérifier les permissions admin
    if (isGroup) {
      const isAdmin = await isUserAdmin(jid, sender, sock);
      if (!isAdmin) {
        return "❌ Seuls les administrateurs ou le propriétaire peuvent utiliser cette commande.";
      }
    } else {
      return "❌ Seul le propriétaire du bot peut utiliser cette commande.";
    }
  }
  
  try {
    // Réinitialiser la mémoire de conversation
    resetConversationMemory(jid);
    return "✅ Historique de conversation réinitialisé avec succès.";
  } catch (error) {
    console.error('❌ Erreur lors de la réinitialisation:', error);
    return "❌ Une erreur est survenue lors de la réinitialisation.";
  }
}

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
    qm?.imageMessage?.caption ||
    qm?.videoMessage?.caption ||
    qm?.documentMessage?.caption ||
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
  // Message texte simple
  if (m.conversation) return m.conversation;
  
  // Message texte étendu
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  
  // Messages média avec caption
  const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage'];
  for (const type of mediaTypes) {
    if (m[type]?.caption) return m[type].caption;
  }
  
  // Messages viewOnce (messages supprimés après visualisation)
  if (m.viewOnceMessage?.message) {
    return extractText({ message: m.viewOnceMessage.message });
  }
  
  // Messages éphemères (disappearing messages)
  if (m.ephemeralMessage?.message) {
    return extractText({ message: m.ephemeralMessage.message });
  }
  
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
  const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toLocaleString() : new Date().toLocaleString();
  const context = msg.message?.extendedTextMessage?.contextInfo || {};
  const mentions = Array.isArray(context?.mentionedJid) ? context.mentionedJid : [];
  const quoted = context?.quotedMessage ? extractTextFromQuoted(context) : null;
  
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
 * Stickers aléatoires avec signature Suprêmus/Makima
 */
async function getRandomSticker() {
  try {
    const stickersDir = path.join(__dirname, 'stickers');
    if (!fs.existsSync(stickersDir)) return null;
    
    const files = fs.readdirSync(stickersDir).filter(f => 
      f.endsWith('.webp') || f.endsWith('.png') || f.endsWith('.jpg')
    );
    
    if (files.length === 0) return null;
    
    const randomFile = files[Math.floor(Math.random() * files.length)];
    const stickerPath = path.join(stickersDir, randomFile);
    
    const sticker = new Sticker(stickerPath, {
      pack: 'Nazuna Bot',
      author: 'Suprêmus/Makima',
      type: StickerTypes.FULL,
      categories: ['🤩', '🎉'],
      quality: 100,
    });
    
    return await sticker.toBuffer();
  } catch (err) {
    console.error('⚠️ Impossible de charger les stickers:', err?.message || err);
    return null;
  }
}

/* =========================
 * CACHE DES MSG DU BOT
 * ========================= */
const botMessageCache = new Map();

/**
 * Mémorise les derniers textes envoyés par le bot dans un chat
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
 * ENVOI AVEC CITATION
 * ========================= */
/**
 * Envoie une réponse en citant le message d'origine
 */
async function sendReply(sock, msg, contentObj, optionsExtra = {}) {
  const jid = msg.key.remoteJid;
  const opts = { quoted: msg, ...optionsExtra };
  console.log('🧷 sendReply -> quoting stanzaId:', msg.key.id, '| to:', jid);
  return sock.sendMessage(jid, contentObj, opts);
}

/**
 * Envoie une réponse avec un délai aléatoire et l'indicateur "en train d'écrire"
 */
async function sendReplyWithTyping(sock, msg, contentObj, optionsExtra = {}) {
  const jid = msg.key.remoteJid;
  const opts = { quoted: msg, ...optionsExtra };
  
  // Délai aléatoire entre 2 et 5 secondes pour paraître plus humain
  const randomDelay = Math.floor(Math.random() * 6000) + 2000;
  
  // Activer l'indicateur "en train d'écrire"
  await sock.sendPresenceUpdate('composing', jid);
  
  // Attendre le délai aléatoire
  await delay(randomDelay);
  
  // Désactiver l'indicateur et envoyer le message
  await sock.sendPresenceUpdate('paused', jid);
  return sock.sendMessage(jid, contentObj, opts);
}

/* =========================
 * HANDLER PRINCIPAL
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
      
      const jid = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.remoteJid;
      const isGroup = jid.endsWith('@g.us');
      const pushName = msg.pushName || 'Inconnu';
      const messageType = getMessageType(msg);
      const body = extractText(msg);
      
      // Ignorer les messages du bot lui-même
      if (sender === BOT_JID || jidEquals(sender, BOT_JID)) return;
      
      // Vérifier le rate limiting
      if (!checkRateLimit(sender)) {
        if (DEBUG) console.log('🐛 Rate limit activé pour:', sender);
        return;
      }
      
      // Traitement des commandes
      if (body.startsWith('/')) {
        const [command, ...args] = body.slice(1).split(' ');
        const response = await handleCommand(command, args, msg, sock);
        
        if (response) {
          await sendReplyWithTyping(sock, msg, { text: response });
        }
        return;
      }
      
      // Réponse aux messages cités qui mentionnent le bot
      const context = msg.message?.extendedTextMessage?.contextInfo || {};
      const quotedText = extractTextFromQuoted(context);
      const isQuotedBot = quotedMatchesBot(jid, quotedText);
      
      if (isQuotedBot || body.includes('@' + normalizeLocal(BOT_JID))) {
        const response = await nazunaReply(body, jid, pushName, isGroup);
        await sendReplyWithTyping(sock, msg, { text: response });
        cacheBotReply(jid, response);
        return;
      }
      
      // Réponse aux messages directs (non-groupes)
      if (!isGroup) {
        const response = await nazunaReply(body, jid, pushName, false);
        await sendReplyWithTyping(sock, msg, { text: response });
        cacheBotReply(jid, response);
        return;
      }
      
      // Réponse aux messages en groupe seulement si le bot est mentionné
      if (body.includes('@' + normalizeLocal(BOT_JID))) {
        const response = await nazunaReply(body, jid, pushName, true);
        await sendReplyWithTyping(sock, msg, { text: response });
        cacheBotReply(jid, response);
        return;
      }
      
      // Traitement des médias (images, vidéos, etc.)
      if (messageType === 'imageMessage' || messageType === 'videoMessage') {
        const detected = await detecterVisuel(msg, sock);
        if (detected) {
          await sendReplyWithTyping(sock, msg, { text: detected });
          cacheBotReply(jid, detected);
        }
      }
      
      // Envoi occasionnel de stickers aléatoires (5% de chance)
      if (Math.random() < 0.05) {
        const stickerBuffer = await getRandomSticker();
        if (stickerBuffer) {
          await sock.sendMessage(jid, { sticker: stickerBuffer });
        }
      }
    } catch (error) {
      console.error('❌ Erreur dans le traitement du message:', error);
    }
  });
  
  // Gérer les erreurs de connexion
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== 401;
      console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
      if (shouldReconnect) {
        main();
      }
    } else if (connection === 'open') {
      console.log('✅ Opened connection');
    }
  });
  
  // Gérer les nouveaux messages dans les groupes
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { id, participants, action } = update;
      if (action === 'add' && participants.includes(BOT_JID)) {
        await sock.sendMessage(id, { 
          text: "👋 Merci de m'avoir ajouté à ce groupe !\n\n" +
                "Je suis Nazuna, un bot conversationnel. Utilisez /help pour voir mes commandes disponibles.\n\n" +
                "Pour m'utiliser, mentionnez-moi simplement dans un message ou répondez à l'un de mes messages."
        });
      }
    } catch (error) {
      console.error('Erreur lors de la gestion des participants:', error);
    }
  });
}

/* =========================
 * POINT D'ENTRÉE PRINCIPAL
 * ========================= */
async function main() {
  try {
    // Attendre que la base de données soit initialisée
    await syncDatabase();
    console.log('✅ Base de données PostgreSQL prête');
    
    // Configuration de l'authentification
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    // Configuration du socket WhatsApp
    const sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      logger: DEBUG ? undefined : { level: 'silent' },
      browser: ['Nazuna Bot', 'Chrome', '1.0.0']
    });
    
    // Sauvegarder les crédentials quand ils changent
    sock.ev.on('creds.update', saveCreds);
    
    // Démarrer le bot
    await startBot(sock, state);
    
  } catch (error) {
    console.error('💥 Erreur fatale lors du démarrage:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Erreur fatale:', err?.stack || err);
  process.exit(1);
});