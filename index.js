// index.js - Version avec support audio

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');
const { default: makeWASocket, useMultiFileAuthState, delay, downloadContentFromMessage, DisconnectReason } = require('@whiskeysockets/baileys');
const { nazunaReply, resetConversationMemory, analyzeImageWithVision, transcribeAudio } = require('./nazunaAI');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { syncDatabase } = require('./models');
const { detecterVisuel } = require('./visuels');
const { loadCommands, getCommand } = require('./commandes');

const DEBUG = (process.env.DEBUG === 'false') || false;
let pair = false;

// =========================
// SYSTÈME SIGNATURE INVISIBLE
// =========================
const BOT_SIGNATURE = ' \u200B\u200C\u200D';

/**
 * Ajoute une signature invisible aux messages du bot
 */
function addSignature(text) {
    return text + BOT_SIGNATURE;
}

/**
 * Vérifie si un texte contient la signature du bot
 */
function hasSignature(text) {
    return text && text.includes(BOT_SIGNATURE);
}

/**
 * Supprime la signature d'un texte pour l'affichage
 */
function removeSignature(text) {
    return text ? text.replace(BOT_SIGNATURE, '') : text;
}

// =========================
// SYSTÈME ANTI-DOUBLONS
// =========================
const processedEvents = new Map();
const EVENT_TIMEOUT = 300000; // 5 minutes
const MAX_CACHE_SIZE = 2000;

/**
 * Vérifie si un événement est un doublon avec journalisation
 */
function isDuplicateEvent(msg) {
    if (!msg.key || !msg.key.id) return false;

    const eventId = msg.key.id;
    const now = Date.now();

    // Vérifier si l'événement existe déjà
    if (processedEvents.has(eventId)) {
        const originalTime = processedEvents.get(eventId);
        const age = now - originalTime;
        console.log(`🚫 Événement dupliqué détecté: ${eventId} (âge: ${age}ms)`);
        return true;
    }

    // Ajouter le nouvel événement
    processedEvents.set(eventId, now);

    // Nettoyage automatique si le cache devient trop grand
    if (processedEvents.size > MAX_CACHE_SIZE) {
        console.log(`🧹 Nettoyage cache événements (${processedEvents.size} entrées)`);
        // Garder seulement les 1000 entrées les plus récentes
        const entries = Array.from(processedEvents.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 1000);
        processedEvents.clear();
        entries.forEach(([id, timestamp]) => processedEvents.set(id, timestamp));
    }

    return false;
}

/**
 * Nettoyage périodique des anciens événements
 */
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [eventId, timestamp] of processedEvents.entries()) {
        if (now - timestamp > EVENT_TIMEOUT) {
            processedEvents.delete(eventId);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`🧹 Nettoyage auto: ${cleanedCount} anciens événements supprimés`);
    }
}, 30000); // Nettoyer toutes les 30 secondes

// Initialisation de la base de données
syncDatabase().then(() => {
  console.log('✅ Base de données PostgreSQL initialisée');
}).catch(err => {
  console.error('❌ Erreur initialisation base de données:', err);
});

// Charger les commandes
loadCommands();
console.log('✅ Commandes chargées');

// Système de rate limiting
const messageLimiter = new Map();
const lastInteraction = new Map();

// Cache des noms de groupe
const groupNameCache = new Map();

// Mémoire des images envoyées par le bot (stocke l'analyse vision)
const botSentImages = new Map();

// Système d'activation/désactivation de l'IA par discussion
const aiStatus = new Map(); // true = activé, false = désactivé

/**
 * Vérifie si un utilisateur peut envoyer un message (rate limiting)
 */
function checkRateLimit(jid, cooldown = 2000) {
    const now = Date.now();
    const lastMessage = messageLimiter.get(jid) || 0;

    if (now - lastMessage < cooldown) {
        return false;
    }

    messageLimiter.set(jid, now);
    return true;
}

/**
 * Vérifie si l'utilisateur est propriétaire du bot (support JID et LID)
 */
function isBotOwner(sender) {
    const botOwners = process.env.BOT_OWNER
        ? process.env.BOT_OWNER.split(',').map(o => o.trim())
        : [];

    return botOwners.some(owner => {
        // Extraire la partie numérique uniquement (supprimer @lid, @s.whatsapp.net, etc.)
        const senderNumber = sender.replace(/@.*|\D/g, '');
        const ownerNumber = owner.replace(/@.*|\D/g, '');
        
        return senderNumber === ownerNumber;
    });
}

/**
 * Active ou désactive l'IA pour une discussion
 */
function setAIStatus(jid, status) {
    aiStatus.set(jid, status);
    console.log(`🔧 IA ${status ? 'activée' : 'désactivée'} pour ${jid}`);
}

/**
 * Vérifie si l'IA est activée pour une discussion
 */
function isAIActive(jid) {
    return aiStatus.get(jid) !== false; // Par défaut activé
}

/**
 * Récupère le nom du groupe avec cache
 */
async function getCachedGroupName(sock, remoteJid) {
    if (!remoteJid.endsWith('@g.us')) return null;

    if (groupNameCache.has(remoteJid)) {
        return groupNameCache.get(remoteJid);
    }

    try {
        const metadata = await sock.groupMetadata(remoteJid);
        const groupName = metadata.subject || null;

        // Mettre en cache pour 5 minutes
        groupNameCache.set(remoteJid, groupName);
        setTimeout(() => groupNameCache.delete(remoteJid), 5 * 60 * 1000);

        return groupName;
    } catch (error) {
        console.error('❌ Erreur récupération nom du groupe:', error);
        return null;
    }
}

/**
 * Analyse et stocke une image envoyée par le bot
 */
async function analyzeAndStoreBotImage(imageUrl, remoteJid) {
    try {
        console.log('🔍 Analyse de l\'image envoyée par le bot...');

        // Télécharger l'image depuis l'URL
        const response = await fetch(imageUrl);
        const imageBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);

        // Analyser avec vision
        const analysis = await analyzeImageWithVision(buffer, 'image/jpeg');

        if (analysis) {
            // Stocker l'analyse pour ce chat
            botSentImages.set(remoteJid, {
                analysis: analysis,
                timestamp: Date.now()
            });

            // Nettoyer après 10 minutes
            setTimeout(() => {
                botSentImages.delete(remoteJid);
            }, 10 * 60 * 1000);

            console.log('✅ Analyse vision stockée pour le prochain message');
            return analysis;
        }
    } catch (error) {
        console.error('❌ Erreur analyse image bot:', error);
    }
    return null;
}

/**
 * Récupère l'analyse de la dernière image envoyée par le bot
 */
function getLastBotImageAnalysis(remoteJid) {
    const data = botSentImages.get(remoteJid);
    if (data && (Date.now() - data.timestamp < 10 * 60 * 1000)) { // 10 minutes
        return data.analysis;
    }
    botSentImages.delete(remoteJid);
    return null;
}

/**
 * Convertit un message audio en texte
 */
async function transcribeAudioMessage(msg) {
    try {
        console.log('🎤 Transcription audio en cours...');
        const audioBuffer = await downloadMediaContent(msg, 'audioMessage');
        
        if (!audioBuffer) {
            console.log('❌ Impossible de télécharger l\'audio');
            return null;
        }

        const transcription = await transcribeAudio(audioBuffer);
        console.log('✅ Transcription audio terminée:', transcription);
        return transcription;
    } catch (error) {
        console.error('❌ Erreur transcription audio:', error);
        return null;
    }
}

/**
 * Télécharge le média d'un message cité (support étendu pour viewOnce et documents)
 */
async function downloadQuotedMedia(msg) {
    try {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo || !contextInfo.quotedMessage) return null;

        const quotedMessage = contextInfo.quotedMessage;
        const quotedMessageType = Object.keys(quotedMessage)[0];

        console.log(`📥 Type de média cité détecté: ${quotedMessageType}`);

        // Gestion des messages viewOnce (supprimés après visualisation)
        if (quotedMessageType === 'viewOnceMessage') {
            const viewOnceContent = quotedMessage.viewOnceMessage?.message;
            if (!viewOnceContent) return null;
            
            const viewOnceType = Object.keys(viewOnceContent)[0];
            console.log(`👀 ViewOnce message de type: ${viewOnceType}`);
            
            if (viewOnceType === 'imageMessage') {
                console.log('📸 Image viewOnce citée détectée, téléchargement...');
                const buffer = await downloadMediaContent({ message: { imageMessage: viewOnceContent.imageMessage } }, 'imageMessage');
                return {
                    type: 'image',
                    buffer: buffer,
                    mimeType: viewOnceContent.imageMessage.mimetype
                };
            } else if (viewOnceType === 'videoMessage') {
                console.log('🎥 Vidéo viewOnce citée détectée, téléchargement...');
                const buffer = await downloadMediaContent({ message: { videoMessage: viewOnceContent.videoMessage } }, 'videoMessage');
                return {
                    type: 'video',
                    buffer: buffer
                };
            }
        }

        // Gestion des documents
        if (quotedMessageType === 'documentMessage') {
            console.log('📄 Document cité détecté, téléchargement...');
            const buffer = await downloadMediaContent({ message: { documentMessage: quotedMessage.documentMessage } }, 'documentMessage');
            return {
                type: 'document',
                buffer: buffer,
                mimeType: quotedMessage.documentMessage.mimetype,
                fileName: quotedMessage.documentMessage.fileName
            };
        }

        // Types de médias standards (existant)
        if (quotedMessageType === 'imageMessage') {
            console.log('📸 Image citée détectée, téléchargement...');
            const buffer = await downloadMediaContent({ message: { imageMessage: quotedMessage.imageMessage } }, 'imageMessage');
            return {
                type: 'image',
                buffer: buffer,
                mimeType: quotedMessage.imageMessage.mimetype
            };
        } else if (quotedMessageType === 'audioMessage') {
            console.log('🎤 Audio cité détecté, téléchargement...');
            const buffer = await downloadMediaContent({ message: { audioMessage: quotedMessage.audioMessage } }, 'audioMessage');
            return {
                type: 'audio',
                buffer: buffer
            };
        } else if (quotedMessageType === 'videoMessage') {
            console.log('🎥 Vidéo citée détectée, téléchargement...');
            const buffer = await downloadMediaContent({ message: { videoMessage: quotedMessage.videoMessage } }, 'videoMessage');
            return {
                type: 'video',
                buffer: buffer
            };
        }

        return null;
    } catch (error) {
        console.error('❌ Erreur téléchargement média cité:', error);
        return null;
    }
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
    const commandModule = getCommand(commandName);

    if (commandModule) {
        return await commandModule.execute(args, msg, sock);
    }

    return `❌ Commande inconnue: /${command}\nTapez /help pour voir les commandes disponibles.`;
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
        qm?.audioMessage?.caption ||
        null
    );
}

/**
 * Type de message (texte, image, audio, etc.)
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
    const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'];
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
 * Stickers aléatoires avec signature Makima/Suprêmus
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

        // Créer un sticker avec les métadonnées Suprêmus/Makima
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
 * AVEC SUPPORT DE LA SIGNATURE INVISIBLE
 */
function quotedMatchesBot(chatId, quotedText) {
    if (!chatId || !quotedText) return false;
    
    // Vérifier d'abord avec la signature invisible
    if (hasSignature(quotedText)) {
        console.log('✅ Message cité reconnu via signature invisible');
        return true;
    }
    
    // Fallback: vérification par cache (pour compatibilité)
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
 * AVEC SIGNATURE INVISIBLE
 */
async function sendReplyWithTyping(sock, msg, contentObj, optionsExtra = {}) {
    const jid = msg.key.remoteJid;
    const opts = { quoted: msg, ...optionsExtra };

    // Délai aléatoire entre 2 et 5 secondes pour paraître plus humain
    const randomDelay = Math.floor(Math.random() * 3000) + 2000;

    // Activer l'indicateur "en train d'écrire"
    await sock.sendPresenceUpdate('composing', jid);

    // Attendre le délai aléatoire
    await delay(randomDelay);

    // Désactiver l'indicateur et envoyer le message
    await sock.sendPresenceUpdate('paused', jid);
    
    // Ajouter la signature invisible au texte
    if (contentObj.text) {
        contentObj.text = addSignature(contentObj.text);
    }
    
    return sock.sendMessage(jid, contentObj, opts);
}

/**
 * Télécharge le contenu d'un message média
 */
async function downloadMediaContent(msg, messageType) {
    try {
        const stream = await downloadContentFromMessage(msg.message[messageType], messageType.replace('Message', ''));
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        console.error('❌ Erreur téléchargement média:', error);
        return null;
    }
}

/* =========================
 *  GESTION DU PAIRING CODE
 * ========================= */
async function handlePairing(sock) {
    if (!sock.authState.creds.registered && !pair) {
        try {
            await delay(3000);
            const numeroPair = process.env.NUMERO_PAIR || '225xxxxxxxxxx';
            const code = await sock.requestPairingCode(numeroPair);
            console.log("🔗 CODE DE PAIRAGE : ", code);
            pair = true;
        } catch (err) {
            console.error("❌ Erreur lors du pairage :", err.message);
        }
    }
}

/* =========================
 *  HANDLER PRINCIPAL
 * ========================= */
async function startBot(sock, state) {
    let BOT_JID = (sock.user && sock.user.id) || (state?.creds?.me?.id) || process.env.BOT_JID || null;

    // Gestion du pairing code
    await handlePairing(sock);

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

            // VÉRIFICATION ANTI-DOUBLON
            if (isDuplicateEvent(msg)) {
                console.log('🚫 Événement dupliqué ignoré:', msg.key.id);
                return;
            }

            prettyLog(msg);

            // Si c'est le bot qui parle → on met en cache et on sort
            if (msg.key.fromMe) {
                const text = extractText(msg);
                if (text) cacheBotReply(msg.key.remoteJid, text);
                return;
            }

            const text = extractText(msg);
            const remoteJid = msg.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');
            const pushName = msg.pushName || msg.notifyName || null;
            const messageType = getMessageType(msg);
            const senderJid = msg.key.participant || remoteJid;

            // ===========================================
            // DÉTECTION DES MENTIONS DU BOT
            // ===========================================
            const botNumbers = ['244285576339508', '177958127927437']; // Tous les numéros possibles
            const keywords = ['supremia', 'makima'];
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            
            const isMentioned =
                mentionedJids.some(jid => botNumbers.some(num => jid.includes(num))) ||
                (text && botNumbers.some(num => text.includes('@' + num))) ||
                (text && keywords.some(word => text.toLowerCase().includes(word)));

            // ===========================================
            // VÉRIFICATION RÉPONSE AU BOT (AVEC SIGNATURE)
            // ===========================================
            const quotedText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
                ? extractTextFromQuoted(msg.message.extendedTextMessage.contextInfo)
                : null;
            const isReplyToBot = quotedText && quotedMatchesBot(remoteJid, quotedText);

            // ===========================================
            // NOUVELLE FONCTIONNALITÉ : ANALYSE DES MÉDIAS CITÉS
            // ===========================================
            let quotedMediaBuffer = null;
            let quotedMediaType = null;
            let quotedMediaMimeType = null;
            let transcribedQuotedAudio = null;

            // Vérifier si l'utilisateur mentionne le bot sur un média cité
            if (isMentioned && msg.message?.extendedTextMessage?.contextInfo) {
                console.log('🔍 Mention détectée sur message cité, vérification média...');
                const quotedMedia = await downloadQuotedMedia(msg);
                
                if (quotedMedia) {
                    if (quotedMedia.type === 'image') {
                        console.log('📸 Image citée détectée avec mention - analyse déclenchée');
                        quotedMediaBuffer = quotedMedia.buffer;
                        quotedMediaType = 'image';
                        quotedMediaMimeType = quotedMedia.mimeType;
                    } else if (quotedMedia.type === 'audio') {
                        console.log('🎤 Audio cité détecté avec mention - transcription déclenchée');
                        try {
                            transcribedQuotedAudio = await transcribeAudio(quotedMedia.buffer);
                            if (transcribedQuotedAudio) {
                                console.log('✅ Transcription audio citée réussie:', transcribedQuotedAudio);
                            } else {
                                console.log('❌ Échec transcription audio cité');
                            }
                        } catch (error) {
                            console.error('❌ Erreur transcription audio cité:', error);
                        }
                    }
                    // NOUVEAU : Gestion des documents cités avec mention
                    else if (quotedMedia.type === 'document') {
                        console.log('📄 Document cité détecté avec mention - traitement...');
                        // Pour les documents, on peut extraire le texte si c'est un fichier texte/PDF
                        // ou simplement informer l'utilisateur du type de document
                        quotedMediaBuffer = quotedMedia.buffer;
                        quotedMediaType = 'document';
                        quotedMediaMimeType = quotedMedia.mimeType;
                    }
                }
            }

            // NOUVELLE SECTION : Analyse des médias cités en réponse au bot (sans mention)
            if (isReplyToBot && !isMentioned && msg.message?.extendedTextMessage?.contextInfo) {
                console.log('🔍 Réponse au bot détectée, vérification média cité...');
                const quotedMedia = await downloadQuotedMedia(msg);
                
                if (quotedMedia) {
                    if (quotedMedia.type === 'image') {
                        console.log('📸 Image citée en réponse au bot - analyse déclenchée');
                        quotedMediaBuffer = quotedMedia.buffer;
                        quotedMediaType = 'image';
                        quotedMediaMimeType = quotedMedia.mimeType;
                    } else if (quotedMedia.type === 'audio') {
                        console.log('🎤 Audio cité en réponse au bot - transcription déclenchée');
                        try {
                            transcribedQuotedAudio = await transcribeAudio(quotedMedia.buffer);
                            if (transcribedQuotedAudio) {
                                console.log('✅ Transcription audio citée réussie:', transcribedQuotedAudio);
                            }
                        } catch (error) {
                            console.error('❌ Erreur transcription audio cité:', error);
                        }
                    } else if (quotedMedia.type === 'document') {
                        console.log('📄 Document cité en réponse au bot - traitement...');
                        quotedMediaBuffer = quotedMedia.buffer;
                        quotedMediaType = 'document';
                        quotedMediaMimeType = quotedMedia.mimeType;
                    }
                }
            }

            // ===========================================
            // GESTION DES MESSAGES AUDIO DIRECTS
            // ===========================================
            let transcribedAudioText = null;
            if (messageType === 'audioMessage') {
                // Condition audio : mention OU réponse au bot
                const shouldTranscribeAudio = isMentioned || isReplyToBot || !isGroup;
                
                if (shouldTranscribeAudio) {
                    console.log('🎤 Message audio détecté, transcription en cours...');
                    transcribedAudioText = await transcribeAudioMessage(msg);
                    
                    if (transcribedAudioText) {
                        console.log('✅ Transcription audio réussie:', transcribedAudioText);
                    } else {
                        console.log('❌ Échec de la transcription audio');
                        await sendReply(sock, msg, { 
                            text: '❌ Désolé, je n\'ai pas pu comprendre le message audio. Pouvez-vous réessayer ou taper votre message ?' 
                        });
                        return;
                    }
                } else {
                    console.log('🎤 Audio ignoré - Aucune condition de transcription remplie');
                }
            }

            // ===========================================
            // ANALYSE D'IMAGES CONDITIONNELLE CORRIGÉE
            // ===========================================
            let imageBuffer = null;
            let imageMimeType = null;

            if (messageType === 'imageMessage') {
                // CONDITION 1: Image avec mention dans la légende
                const imageHasMention = isMentioned;
                
                // CONDITION 2: Réponse à un message du bot AVEC image
                const isReplyToBotWithImage = isReplyToBot && messageType === 'imageMessage';
                
                // CONDITION 3: Discussion privée (toutes les images analysées)
                const isPrivateImage = !isGroup;
                
                const shouldAnalyzeImage = imageHasMention || isReplyToBotWithImage || isPrivateImage;
                
                if (shouldAnalyzeImage) {
                    console.log('📸 Analyse image directe déclenchée - Conditions:', {
                        imageHasMention,
                        isReplyToBotWithImage, 
                        isPrivateImage
                    });
                    imageBuffer = await downloadMediaContent(msg, 'imageMessage');
                    imageMimeType = msg.message.imageMessage.mimetype;
                    console.log('📸 Image téléchargée, taille:', imageBuffer?.length || 0, 'bytes');
                } else {
                    console.log('📸 Image directe ignorée - Aucune condition d\'analyse remplie');
                }
            }

            // ===========================================
            // TEXTE FINAL À TRAITER
            // ===========================================
            // Priorité : transcription audio citée > transcription audio directe > texte normal
            const finalText = transcribedQuotedAudio || transcribedAudioText || text;

            // Vérifier si c'est un message avec média mais sans texte
            if (!finalText && !imageBuffer && !quotedMediaBuffer) {
                // Si c'est un message média sans légende, on ne le traite pas
                const isMedia = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'].includes(messageType);
                if (isMedia && !transcribedAudioText && !transcribedQuotedAudio) {
                    console.log('📸 Message média sans légende - ignoré');
                    return;
                }
            }

            // Rate limiting - éviter de répondre trop souvent
            if (!checkRateLimit(remoteJid, 2000)) {
                console.log('⏳ Rate limiting activé pour ce chat');
                return;
            }

            // Commande ?
            const isCommand = finalText && finalText.startsWith('/');

            // Vérifier si l'IA est désactivée pour cette discussion
            if (!isAIActive(remoteJid) && !isCommand) {
                console.log('🔕 IA désactivée pour cette discussion - ignoré');
                return;
            }

            // ===========================================
            // DÉCISION DE RÉPONSE AMÉLIORÉE
            // ===========================================
            // Nouveaux critères : média cité avec mention OU réponse au bot
            const hasQuotedMediaWithMention = isMentioned && (quotedMediaBuffer || transcribedQuotedAudio);
            // NOUVELLE CONDITION : Réponse au bot avec média cité (sans mention nécessaire)
            const isReplyToBotWithQuotedMedia = isReplyToBot && (quotedMediaBuffer || transcribedQuotedAudio);

            const shouldReply = !isGroup || 
                              isCommand || 
                              isReplyToBot || 
                              isMentioned || 
                              (imageBuffer && (isMentioned || isReplyToBot || !isGroup)) || 
                              transcribedAudioText ||
                              transcribedQuotedAudio ||
                              hasQuotedMediaWithMention ||
                              isReplyToBotWithQuotedMedia; // NOUVELLE CONDITION

            console.log(
                `📌 Decision: shouldReply=${shouldReply} | isGroup=${isGroup} | isCommand=${isCommand} | isReplyToBot=${isReplyToBot} | isMentioned=${isMentioned} | hasImage=${!!imageBuffer} | hasQuotedImage=${!!quotedMediaBuffer} | hasAudio=${!!transcribedAudioText} | hasQuotedAudio=${!!transcribedQuotedAudio} | AIActive=${isAIActive(remoteJid)} | isReplyToBotWithQuotedMedia=${isReplyToBotWithQuotedMedia}`
            );

            if (!shouldReply) return;

            try {
                let reply = null;

                // 1) commandes
                if (isCommand) {
                    const [command, ...args] = finalText.slice(1).trim().split(/\s+/);

                    // Commande réservée au propriétaire : /ai on/off
                    if (command === 'ai' && isBotOwner(senderJid)) {
                        const action = args[0]?.toLowerCase();
                        if (action === 'on') {
                            setAIStatus(remoteJid, true);
                            reply = '✅ IA activée pour cette discussion';
                        } else if (action === 'off') {
                            setAIStatus(remoteJid, false);
                            reply = '🔕 IA désactivée pour cette discussion';
                        } else {
                            reply = '❌ Usage: /ai on ou /ai off';
                        }
                    } else {
                        reply = await handleCommand(command, args, msg, sock);
                    }

                    if (reply) {
                        await sendReplyWithTyping(sock, msg, { text: reply });
                        cacheBotReply(remoteJid, reply);
                        return;
                    }
                }

                // 2) IA (mention / reply / privé / image conditionnelle / audio / média cité)
                console.log(`🤖 IA: génération de réponse pour ${senderJid} dans ${remoteJid}`);

                // Récupérer l'analyse de la dernière image envoyée par le bot (si existe)
                const lastBotImageAnalysis = getLastBotImageAnalysis(remoteJid);
                if (lastBotImageAnalysis) {
                    console.log('🖼️  Analyse vision précédente disponible pour référence');
                }

                // Récupérer le nom du groupe pour le log
                let groupName = null;
                if (isGroup) {
                    groupName = await getCachedGroupName(sock, remoteJid);
                    console.log(`🏷️  Groupe: "${groupName || 'Sans nom'}"`);
                }

                // Préparer les informations de citation pour l'IA
                const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                const quotedTextForAI = contextInfo?.quotedMessage ? extractTextFromQuoted(contextInfo) : null;
                const quotedSender = contextInfo?.participant || null;
                const quotedMessageInfo = quotedTextForAI && quotedSender ? { sender: quotedSender, text: quotedTextForAI } : null;

                // Déterminer le buffer d'image à utiliser (image directe OU image citée)
                const finalImageBuffer = quotedMediaBuffer || imageBuffer;
                const finalImageMimeType = quotedMediaMimeType || imageMimeType;

                const replyObj = await nazunaReply(
                    finalText, 
                    senderJid, 
                    remoteJid, 
                    pushName, 
                    isGroup,
                    quotedMessageInfo,
                    finalImageBuffer,
                    finalImageMimeType,
                    sock,
                    lastBotImageAnalysis,
                    transcribedAudioText || transcribedQuotedAudio ? true : false // Indiquer si c'est une transcription audio
                );

                if (replyObj && replyObj.text) {
                    // Détection de visuel
                    const visuel = detecterVisuel(finalText) || detecterVisuel(replyObj.text);

                    if (visuel && visuel.urlImage) {
                        // Envoyer l'image avec la réponse en légende
                        await sock.sendMessage(remoteJid, {
                            image: { url: visuel.urlImage },
                            caption: addSignature(replyObj.text), // Signature ajoutée
                            mentions: replyObj.mentions || []
                        }, { quoted: msg });

                        // Analyser et stocker l'image envoyée pour le prochain message
                        await analyzeAndStoreBotImage(visuel.urlImage, remoteJid);

                        cacheBotReply(remoteJid, replyObj.text);
                    } else {
                        // Envoi normal si pas de visuel détecté (signature ajoutée dans sendReplyWithTyping)
                        const messageData = {
                            text: replyObj.text, // Signature sera ajoutée dans sendReplyWithTyping
                            mentions: replyObj.mentions || []
                        };
                        await sendReplyWithTyping(sock, msg, messageData);
                        cacheBotReply(remoteJid, replyObj.text);
                    }
                }

                // 3) bonus sticker de temps en temps (seulement 50% de chance)
                if (!isCommand && Math.random() < 0.5) {
                    const stickerPath = await getRandomSticker();
                    if (stickerPath) {
                        await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(stickerPath) });

                        // Supprimer le fichier temporaire
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
        // Attendre que la base de données soit initialisée
        await syncDatabase();
        console.log('✅ Base de données PostgreSQL prête');

        const { state, saveCreds } = await useMultiFileAuthState('./auth');

        const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '128.0.6613.86'],
    version: [2, 3000, 1025190524], 
    getMessage: async key => {
        console.log('⚠️ Message non déchiffré, retry demandé:', key);
        return { conversation: '🔄 Réessaye d\'envoyer ton message' };
    }
});

        sock.ev.on('creds.update', saveCreds);

        console.log('📱 Démarrage avec système de pairing code...');

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

// Export des fonctions
module.exports = {
    isUserAdmin,
    isBotOwner,
    botMessageCache,
    extractText,
    getMessageType,
    downloadMediaContent,
    getCachedGroupName,
    analyzeAndStoreBotImage,
    getLastBotImageAnalysis,
    setAIStatus,
    isAIActive,
    addSignature,
    hasSignature,
    removeSignature,
    transcribeAudioMessage,
    downloadQuotedMedia
};