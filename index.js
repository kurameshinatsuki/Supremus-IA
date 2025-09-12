// index.js - Version optimisée avec commande OCR
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const { default: makeWASocket, useMultiFileAuthState, delay, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { nazunaReply } = require('./nazunaAI');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { syncDatabase } = require('./models');
const { detecterVisuel } = require('./visuels');
const { processImageMessage, processDocumentMessage, calculateOCRQuality } = require('./ocr');

const DEBUG = (process.env.DEBUG === 'false') || true;
let pair = false;
let OCR_ENABLED = true;

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
    
    if (now - lastMessage < cooldown) {
        return false;
    }
    
    messageLimiter.set(jid, now);
    return true;
}

/**
 * Petit utilitaire CLI (pairing code)
 */
function ask(questionText) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(questionText, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

/* =========================
 *        COMMANDES
 * ========================= */
async function handleCommand(command, args, msg, sock) {
    const commandName = (command || '').toLowerCase();

    switch (commandName) {
        case 'tagall':
            return handleTagAll(msg, sock);
        case 'ocr':
            return handleOCRCommand(msg, sock);
        case 'help':
            return (
                "📚 Commandes disponibles :\n" +
                "• /tagall - Mentionne tous les membres du groupe (admin seulement)\n" +
                "• /ocr - Active/désactive la lecture OCR des images\n" +
                "• /help - Affiche ce message d'aide"
            );
        default:
            return null;
    }
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

/**
 * /tagall - mentionne tout le monde (groupes seulement, admin seulement)
 */
async function handleTagAll(msg, sock) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (!jid.endsWith('@g.us')) {
        return "❌ Cette commande n'est disponible que dans les groupes.";
    }

    const isAdmin = await isUserAdmin(jid, sender, sock);
    if (!isAdmin) {
        return "❌ Seuls les administrateurs peuvent utiliser cette commande.";
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
            { quoted: msg }
        );

        return null;
    } catch (error) {
        console.error('❌ Erreur lors du /tagall:', error);
        return "❌ Une erreur est survenue lors de la mention des membres.";
    }
}

/**
 * /ocr - Active/désactive l'OCR pour les images
 */
async function handleOCRCommand(msg, sock) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (jid.endsWith('@g.us')) {
        const isAdmin = await isUserAdmin(jid, sender, sock);
        if (!isAdmin) {
            return "❌ Seuls les administrateurs peuvent utiliser cette commande dans les groupes.";
        }
    }
    
    OCR_ENABLED = !OCR_ENABLED;
    
    return `🔍 OCR ${OCR_ENABLED ? 'activé' : 'désactivé'} pour les images.`;
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
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;

    const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage'];
    for (const type of mediaTypes) {
        if (m[type]?.caption) return m[type].caption;
    }

    if (m.viewOnceMessage?.message) {
        return extractText({ message: m.viewOnceMessage.message });
    }

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
    const timestamp = msg.messageTimestamp
        ? new Date(msg.messageTimestamp * 1000).toLocaleString()
        : new Date().toLocaleString();
    const context = msg.message?.extendedTextMessage?.contextInfo || {};
    const mentions = Array.isArray(context?.mentionedJid) ? context.mentionedJid : [];
    const quoted = context?.quotedMessage
        ? extractTextFromQuoted(context)
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
 * Stickers aléatoires avec signature Suprêmus/Makima
 */
async function getRandomSticker() {
    try {
        const stickersDir = path.join(__dirname, 'stickers');
        if (!fs.existsSync(stickersDir)) return null;

        const files = fs.readdirSync(stickersDir).filter(f => /\.(webp|png|jpe?g)$/i.test(f));
        if (files.length === 0) return null;

        const randomFile = files[Math.floor(Math.random() * files.length)];
        const inputPath = path.join(stickersDir, randomFile);

        const buffer = fs.readFileSync(inputPath);

        const sticker = new Sticker(buffer, {
            pack: "Makima",
            author: "Suprêmus",
            type: StickerTypes.FULL,
            quality: 100,
        });

        const tempPath = path.join(__dirname, `temp_${Date.now()}.webp`);
        await sticker.toFile(tempPath);
        
        return tempPath;
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

    const randomDelay = Math.floor(Math.random() * 6000) + 2000;
    
    await sock.sendPresenceUpdate('composing', jid);
    await delay(randomDelay);
    await sock.sendPresenceUpdate('paused', jid);
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

            if (msg.key.fromMe) {
                const text = extractText(msg);
                if (text) cacheBotReply(msg.key.remoteJid, text);
                return;
            }

            let finalText = extractText(msg);
            const remoteJid = msg.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');
            const pushName = msg.pushName || msg.notifyName || null;
            const messageType = getMessageType(msg);

            // Traiter les images avec OCR si activé
            if (OCR_ENABLED && messageType === 'imageMessage' && (!finalText || finalText.length < 3)) {
                console.log('📸 Tentative d\'extraction de texte depuis l\'image...');
                const ocrText = await processImageMessage(msg, sock);
                
                if (ocrText && ocrText.length > 0) {
                    finalText = ocrText;
                    console.log('✅ Texte extrait par OCR:', ocrText);
                    
                    const quality = calculateOCRQuality(ocrText);
                    let displayText = ocrText.length > 100 ? ocrText.substring(0, 100) + '...' : ocrText;
                    
                    await sock.sendMessage(remoteJid, { 
                        text: `🔍 **Texte détecté** :\n\`\`\`${displayText}\`\`\`\n` +
                              `_Qualité OCR : ${quality}/10_`
                    }, { quoted: msg });
                }
            }

            // Traiter les documents avec OCR si activé
            if (OCR_ENABLED && messageType === 'documentMessage' && (!finalText || finalText.length < 3)) {
                console.log('📄 Tentative d\'extraction de texte depuis le document...');
                const ocrText = await processDocumentMessage(msg, sock);
                
                if (ocrText && ocrText.length > 0) {
                    finalText = ocrText;
                    console.log('✅ Texte extrait par OCR:', ocrText);
                    
                    await sock.sendMessage(remoteJid, { 
                        text: `📝 J'ai détecté du texte dans ce document :\n"${ocrText.substring(0, 100)}${ocrText.length > 100 ? '...' : ''}"` 
                    }, { quoted: msg });
                }
            }

            if (!finalText) {
                const isMedia = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'].includes(messageType);
                if (isMedia) {
                    console.log('📸 Message média sans texte - ignoré');
                    return;
                }
            }

            if (!checkRateLimit(remoteJid, 3000)) {
                console.log('⏳ Rate limiting activé pour ce chat');
                return;
            }

            const quotedText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
                ? extractTextFromQuoted(msg.message.extendedTextMessage.contextInfo)
                : null;
            const isReplyToBot = quotedText && quotedMatchesBot(remoteJid, quotedText);

            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const botNumber = '244285576339508';
            const isMentioned =
                mentionedJids.some(jid => jid.includes(botNumber)) ||
                (finalText && finalText.includes('@' + botNumber)) ||
                (finalText && finalText.toLowerCase().includes('supremia'));

            const isCommand = finalText && finalText.startsWith('/');

            const shouldReply = !isGroup || isCommand || isReplyToBot || isMentioned;

            console.log(
                `📌 Decision: shouldReply=${shouldReply} | isGroup=${isGroup} | isCommand=${isCommand} | isReplyToBot=${isReplyToBot} | isMentioned=${isMentioned}`
            );

            if (!shouldReply) return;

            try {
                let reply = null;

                if (isCommand) {
                    const [command, ...args] = finalText.slice(1).trim().split(/\s+/);
                    reply = await handleCommand(command, args, msg, sock);
                    if (reply) {
                        await sendReplyWithTyping(sock, msg, { text: reply });
                        cacheBotReply(remoteJid, reply);
                        return;
                    }
                }

                const senderJid = msg.key.participant || remoteJid;
                console.log(`🤖 IA: génération de réponse pour ${senderJid} dans ${remoteJid}`);

                const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                const quotedTextForAI = contextInfo?.quotedMessage ? extractTextFromQuoted(contextInfo) : null;
                const quotedSender = contextInfo?.participant || null;
                const quotedMessageInfo = quotedTextForAI && quotedSender ? { sender: quotedSender, text: quotedTextForAI } : null;

                const replyObj = await nazunaReply(
                    finalText, 
                    senderJid, 
                    remoteJid, 
                    pushName, 
                    isGroup,
                    quotedMessageInfo
                );

                if (replyObj && replyObj.text) {
                    const visuel = detecterVisuel(replyObj.text);
                    
                    if (visuel && visuel.urlImage) {
                        await sock.sendMessage(remoteJid, {
                            image: { url: visuel.urlImage },
                            caption: replyObj.text,
                            mentions: replyObj.mentions || []
                        }, { quoted: msg });
                        
                        cacheBotReply(remoteJid, replyObj.text);
                    } else {
                        const messageData = {
                            text: replyObj.text,
                            mentions: replyObj.mentions || []
                        };
                        await sendReplyWithTyping(sock, msg, messageData);
                        cacheBotReply(remoteJid, replyObj.text);
                    }
                }

                if (!isCommand && Math.random() < 0.1) {
                    const stickerPath = await getRandomSticker();
                    if (stickerPath) {
                        await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(stickerPath) });
                        
                        try {
                            fs.unlinkSync(stickerPath);
                        } catch (e) {
                            console.error('Erreur suppression sticker temporaire:', e);
                        }
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
    try {
        console.log('🌐 Préchargement des langues OCR...');
        await Tesseract.createWorker('fra');
        await Tesseract.createWorker('eng');
        console.log('✅ Langues OCR chargées');

        await syncDatabase();
        console.log('✅ Base de données PostgreSQL prête');

        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            browser: ['Ubuntu', 'Chrome', '128.0.6613.86'],
            getMessage: async key => {
                console.log('⚠️ Message non déchiffré, retry demandé:', key);
                return { conversation: '🔄 Réessaye d\'envoyer ton message' };
            }
        });

        sock.ev.on('creds.update', saveCreds);

        console.log('📱 Scannez le QR code affiché pour connecter votre compte');

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
