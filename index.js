// index.js - Version IA humaine et autonome

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

const DEBUG = (process.env.DEBUG === 'true') || false;

// =========================
// CONFIGURATION COMPORTEMENT IA
// =========================
const IA_CONFIG = {
    ACTIVITE_MAX: 0.7,        // 70% de chance d'interagir spontanément
    ACTIVITE_MIN: 0.3,        // 30% de chance minimum
    DELAI_REPONSE_MIN: 1000,  // 1 seconde min
    DELAI_REPONSE_MAX: 4000,  // 4 secondes max
    PARTICIPATION_GROUP: 0.4, // 40% de participation en groupe
    TEMPS_INACTIVITE: 2 * 60 * 1000 // 2 minutes d'inactivité avant reset
};

// =========================
// SYSTÈME SIGNATURE INVISIBLE
// =========================
const BOT_SIGNATURE = ' \u200B\u200C\u200D';

function addSignature(text) {
    return text + BOT_SIGNATURE;
}

function hasSignature(text) {
    return text && text.includes(BOT_SIGNATURE);
}

function removeSignature(text) {
    return text ? text.replace(BOT_SIGNATURE, '') : text;
}

// =========================
// SYSTÈME ANTI-DOUBLONS OPTIMISÉ
// =========================
const processedEvents = new Map();
const EVENT_TIMEOUT = 15000;

function isDuplicateEvent(msg) {
    if (!msg.key || !msg.key.id) return false;
    const eventId = msg.key.id;
    
    if (processedEvents.has(eventId)) {
        console.log(`🚫 Événement dupliqué ignoré: ${eventId}`);
        return true;
    }
    
    processedEvents.set(eventId, Date.now());
    
    if (processedEvents.size > 1000) {
        const now = Date.now();
        for (const [id, timestamp] of processedEvents.entries()) {
            if (now - timestamp > EVENT_TIMEOUT) {
                processedEvents.delete(id);
            }
        }
    }
    
    return false;
}

setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, timestamp] of processedEvents.entries()) {
        if (now - timestamp > EVENT_TIMEOUT) {
            processedEvents.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0 && DEBUG) {
        console.log(`🧹 Nettoyage: ${cleaned} événements`);
    }
}, 30000);

// =========================
// INITIALISATIONS
// =========================
syncDatabase().then(() => {
    console.log('✅ Base de données PostgreSQL initialisée');
}).catch(console.error);

loadCommands();
console.log('✅ Commandes chargées');

// Systèmes de gestion
const messageLimiter = new Map();
const lastInteraction = new Map();
const groupNameCache = new Map();
const botSentImages = new Map();
const aiStatus = new Map();
const conversationContext = new Map();
const botMessageCache = new Map();

// =========================
// FONCTIONS PRINCIPALES
// =========================

function isBotOwner(sender) {
    const botOwners = process.env.BOT_OWNER
        ? process.env.BOT_OWNER.split(',').map(o => o.trim())
        : [];
    
    const senderNumber = sender.replace(/\D/g, '');
    return botOwners.some(owner => senderNumber === owner.replace(/\D/g, ''));
}

function shouldParticipate(remoteJid, isGroup, isMentioned = false) {
    if (isMentioned) return true;
    if (!isGroup) return true;
    if (aiStatus.get(remoteJid) === false) return false;
    
    const lastActive = lastInteraction.get(remoteJid) || 0;
    const timeSinceLast = Date.now() - lastActive;
    
    let participationChance = IA_CONFIG.PARTICIPATION_GROUP;
    if (timeSinceLast > IA_CONFIG.TEMPS_INACTIVITE) {
        participationChance = Math.min(participationChance * 1.5, IA_CONFIG.ACTIVITE_MAX);
    }
    
    return Math.random() < participationChance;
}

function updateInteraction(remoteJid) {
    lastInteraction.set(remoteJid, Date.now());
}

function stripLeadingNonAlnum(s = '') {
    if (!s) return '';
    try {
        return String(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
    } catch (e) {
        return String(s).replace(/^[^a-zA-Z0-9]+/, '').trim();
    }
}

function cacheBotMessage(remoteJid, messageText) {
    if (!remoteJid || !messageText) return;
    
    const messages = botMessageCache.get(remoteJid) || [];
    const text = String(messageText).trim();
    
    messages.unshift({
        text: text,
        timestamp: Date.now(),
        textWithoutSignature: removeSignature(text)
    });
    
    while (messages.length > 50) {
        messages.pop();
    }
    
    botMessageCache.set(remoteJid, messages);
    
    if (DEBUG) {
        console.log('💾 Message bot mis en cache:', remoteJid, text.substring(0, 50) + '...');
    }
}

async function checkReplyToBot(msg, remoteJid) {
    try {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return false;

        const quotedText = extractText({ message: contextInfo.quotedMessage });
        
        if (hasSignature(quotedText)) {
            console.log('✅ Réponse au bot détectée via signature');
            return true;
        }
        
        const botMessages = botMessageCache.get(remoteJid) || [];
        const quotedStripped = stripLeadingNonAlnum(quotedText);
        
        const isReply = botMessages.some(botMsg => {
            const botText = String(botMsg.text || '').trim();
            const botStripped = stripLeadingNonAlnum(botText);
            
            return botText === quotedText || 
                   botStripped === quotedStripped ||
                   botText.includes(quotedText) || 
                   quotedText.includes(botText);
        });
        
        if (isReply) {
            console.log('✅ Réponse au bot détectée via cache');
        }
        
        return isReply;
        
    } catch (error) {
        console.error('❌ Erreur vérification réponse au bot:', error);
        return false;
    }
}

function checkMention(msg) {
    const text = extractText(msg);
    const botNumbers = ['244285576339508', '177958127927437'];
    const keywords = ['supremia', 'makima', 'nazuna', 'bot'];
    
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    return mentionedJids.some(jid => botNumbers.some(num => jid.includes(num))) ||
           (text && botNumbers.some(num => text.includes('@' + num))) ||
           (text && keywords.some(word => text.toLowerCase().includes(word)));
}

// =========================
// GESTION DES MÉDIAS
// =========================

async function handleMediaAnalysis(msg, sock) {
    try {
        const messageType = getMessageType(msg);
        const remoteJid = msg.key.remoteJid;
        const isMentioned = checkMention(msg);
        const isReplyToBot = await checkReplyToBot(msg, remoteJid);
        
        // Images
        if (messageType === 'imageMessage' && (isMentioned || isReplyToBot || shouldParticipate(remoteJid, remoteJid.endsWith('@g.us'), isMentioned))) {
            console.log('📸 Analyse image déclenchée');
            const buffer = await downloadMediaContent(msg, 'imageMessage');
            return {
                type: 'image',
                buffer: buffer,
                mimeType: msg.message.imageMessage.mimetype
            };
        }
        
        // Audio
        if (messageType === 'audioMessage' && (isMentioned || isReplyToBot || !remoteJid.endsWith('@g.us'))) {
            console.log('🎤 Transcription audio déclenchée');
            const buffer = await downloadMediaContent(msg, 'audioMessage');
            const transcription = await transcribeAudio(buffer);
            return {
                type: 'audio',
                transcription: transcription,
                isReplyToBot: isReplyToBot
            };
        }
        
        // Médias cités
        const quotedMedia = await downloadQuotedMedia(msg);
        if (quotedMedia && (isMentioned || isReplyToBot)) {
            console.log('🔍 Média cité détecté');
            return quotedMedia;
        }
        
        return null;
    } catch (error) {
        console.error('❌ Erreur gestion média:', error);
        return null;
    }
}

async function downloadQuotedMedia(msg) {
    try {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return null;

        const quotedMessage = contextInfo.quotedMessage;
        const quotedType = Object.keys(quotedMessage)[0];

        if (quotedType === 'imageMessage') {
            const buffer = await downloadMediaContent({ message: { imageMessage: quotedMessage.imageMessage } }, 'imageMessage');
            return {
                type: 'image',
                buffer: buffer,
                mimeType: quotedMessage.imageMessage.mimetype
            };
        } else if (quotedType === 'audioMessage') {
            const buffer = await downloadMediaContent({ message: { audioMessage: quotedMessage.audioMessage } }, 'audioMessage');
            const transcription = await transcribeAudio(buffer);
            return {
                type: 'audio',
                transcription: transcription
            };
        }

        return null;
    } catch (error) {
        console.error('❌ Erreur média cité:', error);
        return null;
    }
}

// =========================
// FONCTIONS UTILITAIRES
// =========================

function extractText(msg) {
    if (!msg?.message) return '';
    
    const m = msg.message;
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    
    const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'];
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

function getMessageType(msg) {
    return msg?.message ? Object.keys(msg.message)[0] : null;
}

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

async function sendHumanReply(sock, msg, contentObj) {
    const jid = msg.key.remoteJid;
    
    const delayTime = Math.random() * (IA_CONFIG.DELAI_REPONSE_MAX - IA_CONFIG.DELAI_REPONSE_MIN) + IA_CONFIG.DELAI_REPONSE_MIN;
    
    if (delayTime > 2000) {
        await sock.sendPresenceUpdate('composing', jid);
    }
    
    await delay(delayTime);
    
    if (delayTime > 2000) {
        await sock.sendPresenceUpdate('paused', jid);
    }
    
    if (contentObj.text) {
        contentObj.text = addSignature(contentObj.text);
    }
    
    return sock.sendMessage(jid, contentObj, { quoted: msg });
}

// =========================
// GESTION DES COMMANDES
// =========================

async function handleCommand(command, args, msg, sock) {
    const commandName = (command || '').toLowerCase();
    const commandModule = getCommand(commandName);

    if (commandModule) {
        return await commandModule.execute(args, msg, sock);
    }

    return `❌ Commande inconnue: /${command}\nTapez /help pour voir les commandes disponibles.`;
}

// =========================
// STICKERS & VISUELS
// =========================

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
        console.error('⚠️ Erreur stickers:', err.message);
        return null;
    }
}

// =========================
// BOT PRINCIPAL
// =========================

async function startBot(sock, state) {
    let BOT_JID = sock.user?.id || state?.creds?.me?.id || process.env.BOT_JID;

    if (!sock.authState.creds.registered) {
        try {
            await delay(2000);
            const numeroPair = process.env.NUMERO_PAIR || '225xxxxxxxxxx';
            const code = await sock.requestPairingCode(numeroPair);
            console.log("🔗 CODE DE PAIRAGE :", code);
        } catch (err) {
            console.error("❌ Erreur pairage:", err.message);
        }
    }

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open' && sock.user?.id) {
            BOT_JID = sock.user.id;
            console.log('✅ Connexion établie - Bot:', BOT_JID);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages?.[0];
            if (!msg?.message) return;

            if (isDuplicateEvent(msg)) return;

            const remoteJid = msg.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');
            const senderJid = msg.key.participant || remoteJid;
            const text = extractText(msg);
            const isMentioned = checkMention(msg);
            
            updateInteraction(remoteJid);

            if (msg.key.fromMe) return;

            // Commandes
            if (text?.startsWith('/')) {
                const [command, ...args] = text.slice(1).trim().split(/\s+/);
                
                if (command === 'ai' && isBotOwner(senderJid)) {
                    const action = args[0]?.toLowerCase();
                    if (action === 'on') {
                        aiStatus.set(remoteJid, true);
                        await sendHumanReply(sock, msg, { text: '✅ IA activée - Je participe plus activement' });
                    } else if (action === 'off') {
                        aiStatus.set(remoteJid, false);
                        await sendHumanReply(sock, msg, { text: '🔕 IA désactivée - Je suis en mode silencieux' });
                    }
                    return;
                }
                
                const reply = await handleCommand(command, args, msg, sock);
                if (reply) {
                    await sendHumanReply(sock, msg, { text: reply });
                }
                return;
            }

            // Décision d'interaction
            const shouldInteract = shouldParticipate(remoteJid, isGroup, isMentioned);
            
            if (!shouldInteract) {
                if (DEBUG) console.log(`🔕 Pas d'interaction - Groupe:${isGroup} Mention:${isMentioned}`);
                return;
            }

            // Analyse des médias
            const mediaAnalysis = await handleMediaAnalysis(msg, sock);
            
            // Préparation contexte
            let finalText = text;
            let imageBuffer = null;
            let audioTranscription = null;

            if (mediaAnalysis) {
                if (mediaAnalysis.type === 'image') {
                    imageBuffer = mediaAnalysis.buffer;
                    console.log('🖼️ Image à analyser disponible');
                } else if (mediaAnalysis.type === 'audio' && mediaAnalysis.transcription) {
                    audioTranscription = mediaAnalysis.transcription;
                    finalText = audioTranscription;
                    console.log('🎤 Transcription audio:', audioTranscription);
                }
            }

            // Génération réponse IA
            try {
                console.log(`🤖 Génération réponse pour ${senderJid}`);
                
                const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                const quotedText = contextInfo?.quotedMessage ? 
                    extractText({ message: contextInfo.quotedMessage }) : null;
                
                const replyObj = await nazunaReply(
                    finalText, 
                    senderJid, 
                    remoteJid, 
                    msg.pushName || 'Utilisateur', 
                    isGroup,
                    quotedText ? { sender: contextInfo.participant, text: quotedText } : null,
                    imageBuffer,
                    imageBuffer ? 'image/jpeg' : null,
                    sock,
                    null,
                    !!audioTranscription
                );

                if (replyObj?.text) {
                    // DÉTECTION DE VISUEL NAZUNAAI 🎯
                    const visuel = detecterVisuel(finalText) || detecterVisuel(replyObj.text);

                    if (visuel && visuel.urlImage) {
                        // Envoyer l'image avec la réponse en légende
                        await sock.sendMessage(remoteJid, {
                            image: { url: visuel.urlImage },
                            caption: addSignature(replyObj.text),
                            mentions: replyObj.mentions || []
                        }, { quoted: msg });
                    } else {
                        // Envoi normal
                        await sendHumanReply(sock, msg, {
                            text: replyObj.text,
                            mentions: replyObj.mentions || []
                        });
                    }

                    // Mémoriser le message du bot
                    cacheBotMessage(remoteJid, replyObj.text);

                    // Sticker aléatoire (30% de chance)
                    if (Math.random() < 0.3) {
                        const stickerPath = await getRandomSticker();
                        if (stickerPath) {
                            await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(stickerPath) });
                            try { fs.unlinkSync(stickerPath); } catch (e) {}
                        }
                    }
                }

            } catch (error) {
                console.error('❌ Erreur génération réponse:', error);
                await sendHumanReply(sock, msg, { 
                    text: 'Désolé, je rencontre un petit problème technique. Pouvez-vous réessayer ? 😊' 
                });
            }

        } catch (err) {
            console.error('❌ Erreur traitement message:', err);
        }
    });
}

// =========================
// DÉMARRAGE
// =========================
async function main() {
    try {
        await syncDatabase();
        console.log('✅ Base de données prête');

        const { state, saveCreds } = await useMultiFileAuthState('./auth');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '128.0.6613.86'],
            version: [2, 3000, 1025190524],
            getMessage: async key => {
                return { conversation: '🔄 Message non reçu, peux-tu répéter ?' };
            }
        });

        sock.ev.on('creds.update', saveCreds);
        console.log('📱 Démarrage bot IA humaine...');

        await startBot(sock, state);
    } catch (error) {
        console.error('💥 Erreur démarrage:', error);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('💥 Erreur fatale:', err);
    process.exit(1);
});

module.exports = {
    isBotOwner,
    extractText,
    getMessageType,
    downloadMediaContent,
    checkMention,
    shouldParticipate
};