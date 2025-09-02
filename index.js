// index.js - reply-to detection via cache + robust mentions + sticker conversion (sharp) + proper quoting
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const { nazunaReply } = require('./nazunaAI');

const DEBUG = (process.env.DEBUG === 'true') || false;
let pair = false;
let cacheBotReply = null; // si tu veux garder un cache simple des réponses

/* ===== Helpers ===== */
function ask(questionText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(questionText, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

function normalizeLocal(jid = '') {
  return String(jid || '').split('@')[0].replace(/\D/g, '');
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

function extractTextFromQuoted(contextInfo = {}) {
  const qm = contextInfo?.quotedMessage || {};
  return (
    qm?.conversation ||
    qm?.extendedTextMessage?.text ||
    null
  );
}

function extractQuotedSender(contextInfo = {}) {
  return contextInfo?.participant || null;
}

function prettyLog(msg) {
  const key = msg.key || {};
  const remote = key.remoteJid || 'unknown';
  const isGroup = remote.endsWith('@g.us');
  const participant = key.participant || remote;
  const pushName = msg.pushName || msg.notifyName || 'unknown';
  const body = extractText(msg) || '[non-textuel]';
  const timestamp = msg.messageTimestamp
    ? new Date(msg.messageTimestamp * 1000).toLocaleString()
    : new Date().toLocaleString();
  console.log('\n==========================');
  console.log('📩 Nouveau message —', timestamp);
  console.log('👥 Chat   :', remote, isGroup ? '(Groupe)' : '(Privé)');
  console.log('👤 From   :', participant, '| pushName:', pushName);
  console.log('📝 Texte  :', body);
  console.log('🧷 stanzaId:', key.id, '| participant:', key.participant || '(none)');
  console.log('==========================\n');
}

/* ===== Mention conversion ===== */
function convertReplyMentionsToClickable(text, mentionsFromAI) {
  if (!Array.isArray(mentionsFromAI) || mentionsFromAI.length === 0) {
    return { finalText: text, mentionJids: [] };
  }

  const mentionObjs = mentionsFromAI.map(m => typeof m === 'string' ? { jid: m, name: null, raw: null } : m);
  let finalText = text;
  const usedJids = [];

  for (const mo of mentionObjs) {
    if (!mo || !mo.jid || usedJids.includes(mo.jid)) continue;
    const local = normalizeLocal(mo.jid);
    if (mo.raw) {
      const escapedRaw = mo.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        const regex = new RegExp('@\\s*' + escapedRaw, 'giu');
        finalText = finalText.replace(regex, '@' + local);
      } catch {}
    }
    usedJids.push(mo.jid);
  }

  if (usedJids.length > 0 && finalText === text) {
    const tags = usedJids.map(j => '@' + normalizeLocal(j)).join(' ');
    finalText = `${tags}\n${text}`.trim();
  }

  return { finalText, mentionJids: usedJids };
}

/* ===== sendReply ===== */
async function sendReply(sock, msg, contentObj, optionsExtra = {}) {
  const jid = msg.key.remoteJid;
  const opts = { quoted: msg, ...optionsExtra };
  return sock.sendMessage(jid, contentObj, opts);
}

/* ===== Commandes simples (exemple) ===== */
async function handleCommand(cmd, args, msg, sock) {
  switch (cmd.toLowerCase()) {
    case 'ping': return 'Pong!';
    case 'say': return args.join(' ') || 'Rien à dire...';
    default: return null;
  }
}

/* ===== Main Bot Handler ===== */
async function startBot(sock, state) {
  let BOT_JID = (sock.user && sock.user.id) || (state?.creds?.me?.id) || process.env.BOT_JID || null;

  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open' && sock.user?.id) {
      BOT_JID = sock.user.id;
      console.log('✅ Connexion ouverte — Bot JID:', BOT_JID);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages && messages[0];
    if (!msg || !msg.message) return;

    prettyLog(msg);

    const text = extractText(msg);
    if (!text) return;

    if (msg.key.fromMe) {
      cacheBotReply && cacheBotReply(msg.key.remoteJid, text);
      return;
    }

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const pushName = msg.pushName || msg.notifyName || null;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedText = contextInfo?.quotedMessage ? extractTextFromQuoted(contextInfo) : null;
    const quotedSender = extractQuotedSender(contextInfo);
    let quotedMessageInfo = quotedText && quotedSender ? { sender: quotedSender, text: quotedText } : null;

    const senderJid = msg.key.participant || remoteJid;
    const mentionedJids = contextInfo?.mentionedJid || [];
    const botNumber = process.env.BOT_NUMBER?.replace(/[^0-9]/g, '') || '111536592965872';
    const isMentioned =
      mentionedJids.some(jid => jid.includes(botNumber)) ||
      (text && text.includes('@' + botNumber)) ||
      (text && text.toLowerCase().includes('supremia'));

    const isCommand = text.startsWith('/');
    const shouldReply = !isGroup || isCommand || quotedMessageInfo || isMentioned;
    if (!shouldReply) return;

    try {
      if (isCommand) {
        const [cmd, ...args] = text.slice(1).trim().split(/\s+/);
        const reply = await handleCommand(cmd, args, msg, sock);
        if (reply) {
          await sendReply(sock, msg, { text: reply });
          cacheBotReply && cacheBotReply(remoteJid, reply);
          return;
        }
      }

      const replyObj = await nazunaReply(text, senderJid, remoteJid, pushName, isGroup, quotedMessageInfo);
      if (!replyObj || !replyObj.text) return;

      if (DEBUG) console.log('🧠 Nazuna replyObj:', JSON.stringify(replyObj, null, 2));

      const conversion = convertReplyMentionsToClickable(replyObj.text, replyObj.mentions || []);
      const finalText = conversion.finalText;
      const mentionJids = conversion.mentionJids;

      await sendReply(sock, msg, mentionJids.length > 0 ? { text: finalText, mentions: mentionJids } : { text: finalText });
      cacheBotReply && cacheBotReply(remoteJid, finalText);

    } catch (error) {
      console.error('❌ Erreur lors du traitement du message:', error?.stack || error);
      await sendReply(sock, msg, { text: '❌ Désolé, une erreur est survenue. Veuillez réessayer plus tard.' });
    }
  });
}

/* ===== MAIN ===== */
async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    getMessage: async key => ({ conversation: '🔄 Réessaye d\'envoyer ton message' })
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered && !pair) {
    try {
      await delay(3000);
      const number = process.env.BOT_NUMBER || await ask('Entrez le numéro WhatsApp (ex: 22898133388) : ');
      const code = await sock.requestPairingCode(number);
      console.log('🔗 PAIR-CODE : ', code);
      pair = true;
      console.log('📱 Va dans WhatsApp > Paramètres > Appareils liés > Lier avec le code');
    } catch (err) {
      console.error('❌ Erreur pairing:', err?.message || err);
    }
  }

  await startBot(sock, state);
}

main().catch(err => console.error('💥 Erreur fatale:', err?.stack || err));