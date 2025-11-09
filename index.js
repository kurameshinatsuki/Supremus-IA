// index.js - Version avec support audio et améliorations

require('dotenv').config();
const fs = require('fs');
const chemin = require('chemin');
const readline = require('readline');
const sharp = require('sharp');
const { default: makeWASocket, useMultiFileAuthState, delay, downloadContentFromMessage, DisconnectReason } = require('@whiskeysockets/baileys');
const { nazunaReply, resetConversationMemory, analyzeImageWithVision, transcribeAudio } = require('./nazunaAI');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { syncDatabase } = require('./models');
const { détecterVisuel } = require('./visuels');
const {loadCommands, getCommand } = require('./commandes');

const DEBUG = (process.env.DEBUG === 'false') || false;
soit paire = faux;

// =========================
// SYSTÈME SIGNATURE INVISIBLE
// =========================
const BOT_SIGNATURE = ' \u200B\u200C\u200D';

/**
 * Ajout d'une signature invisible aux messages du bot
 */
fonction ajouterSignature(texte) {
    renvoyer le texte + BOT_SIGNATURE ;
}

/**
 * Vérifiez si un texte contient la signature du bot
 */
fonction aSignature(texte) {
    retourner le texte && texte.includes(BOT_SIGNATURE);
}

/**
 * Supprime la signature d'un texte pour l'affichage
 */
fonction supprimerSignature(texte) {
    retourner le texte ? texte.remplacer(BOT_SIGNATURE, '') : texte ;
}

// =========================
// SYSTÈME ANTI-DOUBLONS
// =========================
const processedEvents = new Map();
const EVENT_TIMEOUT = 30 000 ; // 30 secondes
const MAX_CACHE_SIZE = 2000;

/**
 * Vérifie si un événement est un double avec journalisation
 */
fonction isDuplicateEvent(msg) {
    si (!msg.key || !msg.key.id) retourner faux ;

    const eventId = msg.key.id;
    const maintenant = Date.maintenant();

    // Vérifier si l'événement existe déjà
    si (processedEvents.has(eventId)) {
        const originalTime = processedEvents.get(eventId);
        const âge = maintenant - tempsoriginal;
        console.log(`🚫 Événement dupliqué détecté: ${eventId} (âge: ${age}ms)`);
        renvoyer vrai ;
    }

    // Ajouter le nouvel événement
    processedEvents.set(eventId, maintenant);

    // Nettoyage automatique si le cache devient trop grand
    si (processedEvents.size > MAX_CACHE_SIZE) {
        console.log(`🧹 Nettoyage cache événements (${processedEvents.size} entrées)`);
        // Garder seulement les 1000 entrées les plus récentes
        const entries = Array.from(processedEvents.entries())
            .sort((a, b) => b[1] - a[1])
            .tranche(0, 1000);
        processedEvents.clear();
        entries.forEach(([id, timestamp]) => processedEvents.set(id, timestamp));
    }

    renvoyer faux ;
}

/**
 * Nettoyage périodique des anciens événements
 */
définirInterval(() => {
    const maintenant = Date.maintenant();
    soit cleanedCount = 0 ;

    pour (const [eventId, timestamp] de processedEvents.entries()) {
        si (maintenant - horodatage > EVENT_TIMEOUT) {
            processedEvents.delete(eventId);
            nettoyéCount++;
        }
    }

    si (cleanedCount > 0) {
        console.log(`🧹 Nettoyage auto: ${cleanedCount} anciens événements supprimés`);
    }
}, 30 000); // Nettoyer toutes les 30 secondes

// Initialisation de la base de données
syncDatabase().then(() => {
  console.log('✅ Base de données PostgreSQL initialisée');
}).catch(err => {
  console.error('❌ Erreur initialisation base de données:', err);
});

// Charger les commandes
chargerCommandes();
console.log('✅ Commandes chargées');

// Système de limitation de débit
const messageLimiter = new Map();
const dernièreInteraction = nouvelle Map();

// Cache des noms de groupe
const groupNameCache = new Map();

// Mémoire des images envoyées par le bot (stocke l'analyse vision)
const botSentImages = new Map();

// Système d'activation/désactivation de l'IA par discussion
const aiStatus = new Map(); // vrai = activé, faux = désactivé

/**
 * Vérifie si un utilisateur peut envoyer un message (limitation de débit)
 */
fonction checkRateLimit(jid, cooldown = 2000) {
    const maintenant = Date.maintenant();
    const lastMessage = messageLimiter.get(jid) || 0;

    si (maintenant - dernierMessage < délai de refroidissement) {
        renvoyer faux ;
    }

    messageLimiter.set(jid, maintenant);
    renvoyer vrai ;
}

/**
 * Vérifie si l'utilisateur est propriétaire du bot
 */
fonction isBotOwner(expéditeur) {
    const botOwners = process.env.BOT_OWNER
        ? process.env.BOT_OWNER.split(',').map(o => o.trim())
        : [];

    return botOwners.some(owner => {
        // Extraire la partie numérique uniquement
        const senderNumber = sender.replace(/\D/g, '');
        const ownerNumber = owner.replace(/\D/g, '');
        
        renvoyer senderNumber === ownerNumber;
    });
}

/**
 * Activer ou désactiver l'IA pour une discussion
 */
fonction setAIStatus(jid, statut) {
    aiStatus.set(jid, statut);
    console.log(`🔧 IA ${status ? 'activée' : 'désactivée'} pour ${jid}`);
}

/**
 * Vérifiez si l'IA est activé pour une discussion
 */
fonction isAIActive(jid) {
    return aiStatus.get(jid) !== false; // Par défaut activé
}

/**
 * Récupère le nom du groupe avec cache
 */
fonction asynchrone getCachedGroupName(sock, remoteJid) {
    si (!remoteJid.endsWith('@g.us')) retourner null;

    si (groupNameCache.has(remoteJid)) {
        retourner groupNameCache.get(remoteJid);
    }

    essayer {
        const metadata = await sock.groupMetadata(remoteJid);
        const groupName = metadata.subject || null;

        // Mettre en cache pendant 5 minutes
        groupNameCache.set(remoteJid, groupName);
        setTimeout(() => groupNameCache.delete(remoteJid), 5 * 60 * 1000);

        renvoyer groupName;
    } attraper (erreur) {
        console.error('❌ Erreur récupération nom du groupe:', error);
        renvoyer null ;
    }
}

/**
 * Analyser et stocker une image envoyée par le bot
 */
fonction asynchrone analyzeAndStoreBotImage(imageUrl, remoteJid) {
    essayer {
        console.log('🔍 Analyse de l\'image envoyée par le bot...');

        // Télécharger l'image depuis l'URL
        const réponse = await fetch(imageUrl);
        const imageBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);

        // Analyser avec vision
        const analyse = await analyzeImageWithVision(buffer, 'image/jpeg');

        si (analyse) {
            // Stocker l'analyse pour ce chat
            botSentImages.set(remoteJid, {
                analyse : analyse,
                horodatage : Date.now()
            });

            // Nettoyer après 10 minutes
            setTimeout(() => {
                botSentImages.delete(remoteJid);
            }, 10 * 60 * 1000);

            console.log('✅ Analyser la vision stockée pour le prochain message');
            analyse des retours ;
        }
    } attraper (erreur) {
        console.error('❌ Erreur analyser l'image bot:', erreur);
    }
    renvoyer null ;
}

/**
 * Récupère l'analyse de la dernière image envoyée par le bot
 */
fonction getLastBotImageAnalysis(remoteJid) {
    const data = botSentImages.get(remoteJid);
    if (data && (Date.now() - data.timestamp < 10 * 60 * 1000)) { // 10 minutes
        renvoyer les données.analyse ;
    }
    botSentImages.delete(remoteJid);
    renvoyer null ;
}

/**
 * Convertir un message audio en texte
 */
fonction asynchrone transcrireMessageAudio(msg) {
    essayer {
        console.log('🎤 Transcription audio en cours...');
        const audioBuffer = await downloadMediaContent(msg, 'audioMessage');
        
        si (!audioBuffer) {
            console.log('❌ Impossible de télécharger l\'audio');
            renvoyer null ;
        }

        const transcription = await transcribeAudio(audioBuffer);
        console.log('✅ Transcription audio terminée :', transcription);
        retour transcription ;
    } attraper (erreur) {
        console.error('❌ Erreur de transcription audio :', erreur);
        renvoyer null ;
    }
}

/**
 * Télécharge le média d'un message cité
 */
fonction asynchrone downloadQuotedMedia(msg) {
    essayer {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        si (!contextInfo || !contextInfo.quotedMessage) retourner null ;

        const quotedMessage = contextInfo.quotedMessage;
        const quotedMessageType = Object.keys(quotedMessage)[0];

        si (quotedMessageType === 'imageMessage') {
            console.log('📸 Image citée détectée, téléchargement...');
            const buffer = await downloadMediaContent({ message: { imageMessage: quotedMessage.imageMessage } }, 'imageMessage');
            retour {
                type: 'image',
                tampon : tampon,
                mimeType: quotedMessage.imageMessage.mimetype
            };
        } sinon si (quotedMessageType === 'audioMessage') {
            console.log('🎤 Audio cité détectée, téléchargement...');
            const buffer = await downloadMediaContent({ message: { audioMessage: quotedMessage.audioMessage } }, 'audioMessage');
            retour {
                type: 'audio',
                tampon : tampon
            };
        }

        renvoyer null ;
    } attraper (erreur) {
        console.error('❌ Erreur téléchargement média cité:', error);
        renvoyer null ;
    }
}

/**
 * Extrait le contenu des messages viewOnce (vues uniques)
 */
fonction extraireViewOnceContent(msg) {
    si (!msg || !ms.message) retourner null ;
    
    const viewOnceMessage = msg.message.viewOnceMessage;
    si (!viewOnceMessage) retourner null ;
    
    const innerMessage = viewOnceMessage.message;
    si (!innerMessage) retourner null ;
    
    // Extraire le type de média
    const mediaType = Object.keys(innerMessage)[0];
    
    // Extraire le texte (légende) si présent
    const caption = innerMessage[mediaType]?.caption || '';
    
    retour {
        type : type de média,
        légende : légende,
        message: innerMessage[mediaType]
    };
}

/**
 * Petit utilitaire CLI (code d'appairage)
 */
fonction demander(texte de la question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    retourner une nouvelle promesse((résolu) => {
        rl.question(questionText, (answer) => {
            rl.close();
            résoudre(réponse.trim());
        });
    });
}

/* =========================
 * COMMANDES
 * ========================= */
fonction asynchrone handleCommand(commande, args, msg, sock) {
    const commandName = (command || '').toLowerCase();
    const commandModule = getCommand(commandName);

    si (commandModule) {
        return await commandModule.execute(args, msg, sock);
    }

    return `❌ inconnue Commande: /${command}\nTapez /help pour voir les commandes disponibles.`;
}

/**
 * Vérifie si l'expéditeur est admin du groupe
 */
fonction asynchrone isUserAdmin(jid, participant, sock) {
    essayer {
        const métadonnées = await sock.groupMetadata(jid);
        const admins = metadata.participants.filter(p => p.admin !== null).map(p => p.id);
        retourner admins.includes(participant);
    } attraper (erreur) {
        console.error('Erreur vérification admin:', erreur);
        renvoyer faux ;
    }
}

/* =========================
 * AIDE
 * ========================= */
fonction normalizeLocal(jid = '') {
    retourner String(jid || '').split('@')[0];
}

fonction jidEquals(a, b) {
    si (!a || !b) retourner faux ;
    retourner normalizeLocal(a) === normalizeLocal(b);
}

/**
 * Récupère le texte d'un message cité (si présent)
 */
fonction extraireTexteDeQuoted(contextInfo = {}) {
    const qm = contextInfo?.quotedMessage || {};
    retour (
        qm?.conversation ||
        qm?.extendedTextMessage?.texte ||
        qm?.imageMessage?.caption ||
        qm?.videoMessage?.caption ||
        qm?.documentMessage?.caption ||
        qm?.audioMessage?.caption ||
        nul
    );
}

/**
 * Type de message (texte, image, audio, etc.)
 */
fonction getMessageType(msg) {
    si (!msg || !ms.message) retourner null ;
    renvoie Object.keys(msg.message)[0];
}

/**
 * Récupère un texte lisible d'un WAMessage (légende incluse)
 */
fonction extraireTexte(msg) {
    si (!msg || !msg.message) retourner '';

    const m = msg.message;
    
    // Vérifiez les messages viewOnce en premier
    const viewOnceContent = extractViewOnceContent(msg);
    si (viewOnceContent && viewOnceContent.caption) {
        retourner viewOnceContent.caption;
    }
    
    // Message texte simple
    si (m.conversation) retourner m.conversation;

    // Message texte étendu
    si (m.extendedTextMessage?.text) retourner m.extendedTextMessage.text ;

    // Messages média avec légende
    const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'];
    pour (const type de mediaTypes) {
        si (m[type]?.caption) retourner m[type].caption;
    }

    // Messages éphémères (disappearing messages)
    si (m.ephemeralMessage?.message) {
        return extractText({ message: m.ephemeralMessage.message });
    }

    retour '';
}

/**
 * Journal disponible pour le débogage
 */
fonction prettyLog(msg) {
    const clé = msg.clé || {};
    const remote = key.remoteJid || 'inconnu';
    const isGroup = remote.endsWith('@g.us');
    const participant = clé.participant || distant;
    const pushName = msg.pushName || msg.notifyName || 'inconnu';
    const msgType = getMessageType(msg) || 'inconnu';
    const corps = extraitTexte(msg) || '[non textuel]';
    const timestamp = msg.messageTimestamp
        ? new Date(msg.messageTimestamp * 1000).toLocaleString()
        : nouvelle Date().toLocaleString();
    const contexte = msg.message?.extendedTextMessage?.contextInfo || {};
    const mentions = Array.isArray(context?.mentionedJid) ? context.mentionedJid : [];
    const quoted = context?.quotedMessage
        ? extraireTexteDeCitation(contexte)
        : nul;

    console.log('\n==========================');
    console.log('📩 Nouveau message —', timestamp);
    console.log('👥 Chat :', remote, isGroup ? '(Groupe)' : '(Privé)');
    console.log('👤 De :', participant, '| pushName:', pushName);
    console.log('📦 Type :', msgType);
    console.log('📝 Texte :', body);
    if (mentions.length) console.log('🔔 Mentions:', mentions.join(', '));
    if (quoted) console.log('❝ Cité :', quoted);
    console.log('🧷 stanzaId:', key.id, '| participant:', key.participant || '(none)');
    console.log('==========================\n');
}

/**
 * Nettoie les caractères non alphanumériques initiaux
 */
fonction stripLeadingNonAlnum(s = '') {
    si (!s) retourner '';
    essayer {
        return String(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
    } attraper (e) {
        return String(s).replace(/^[^a-zA-Z0-9]+/, '').trim();
    }
}

/**
 * Autocollants aléatoires avec signature Makima/Suprêmus
 */
fonction asynchrone getRandomSticker() {
    essayer {
        const stickersDir = path.join(__dirname, 'stickers');
        if (!fs.existsSync(stickersDir)) return null;

        const fichiers = fs.readdirSync(stickersDir).filter(f => /\.(webp|png|jpe?g)$/i.test(f));
        si (files.length === 0) retourner null ;

        const fichier_aléatoire = fichiers[Math.floor(Math.random() * fichiers.length)];
        const inputPath = path.join(stickersDir, randomFile);

        const buffer = fs.readFileSync(inputPath);

        // Créer un sticker avec les métadonnées Suprêmus/Makima ET signature invisible
        const stickerMetadata = "Makima - Suprêmus" + BOT_SIGNATURE;
        
        const sticker = new Sticker(buffer, {
            pack : "Makima",
            auteur : stickerMetadata, // Signature invisible incluse
            type: StickerTypes.FULL,
            qualité : 100,
        });

        const tempPath = path.join(__dirname, `temp_${Date.now()}.webp`);
        attendre sticker.toFile(tempPath);

        renvoyer tempPath;
    } attraper (erreur) {
        console.error('⚠️ Impossible de charger les stickers:', err?.message || err);
        renvoyer null ;
    }
}

/* =========================
 * CACHE DES MSG DU BOT
 * ========================= */
const botMessageCache = new Map();

/**
 * Mémorisez les derniers textes envoyés par le bot dans un chat
 */
fonction cacheBotReply(chatId, texte) {
    si (!chatId || !text) retourner;
    const arr = botMessageCache.get(chatId) || [];
    const t = String(texte || '').trim();
    arr.unshift({ text: t, ts: Date.now() });

    const stripped = stripLeadingNonAlnum(t);
    if (stripped && stripped !== t) arr.unshift({ text: stripped, ts: Date.now() });

    tant que (arr.length > 160) arr.pop();
    botMessageCache.set(chatId, arr);
    si (DEBUG) {
        console.log('🐛 DEBUG cacheBotReply:', chatId, '=>', arr.slice(0, 6).map(i => i.text));
    }
}

/**
 * Vérifie si le texte cité correspond à un des derniers messages du bot
 * AVEC SUPPORT DE LA SIGNATURE INVISIBLE
 */
fonction quotedMatchesBot(chatId, quotedText) {
    si (!chatId || !quotedText) retourner faux ;
    
    // Vérifier d'abord avec la signature invisible
    si (hasSignature(quotedText)) {
        console.log('✅ Message cité reconnu via signature invisible');
        renvoyer vrai ;
    }
    
    // Fallback : vérification par cache (pour compatibilité)
    const arr = botMessageCache.get(chatId) || [];
    const q = String(quotedText || '').trim();
    const qStripped = stripLeadingNonAlnum(q);
    const qLower = q.toLowerCase();
    const qStrippedLower = qStripped.toLowerCase();

    const trouvé = arr.some(item => {
        const it = String(item.text || '').trim().toLowerCase();
        retourner il === qLower || il === qStrippedLower;
    });

    si (DEBUG) {
        console.log('🐛 DEBUG quotedMatchesBot:', { chatId, quotedText: q, stripped: qStripped, found });
    }
    retour trouvé ;
}

/* =========================
 * ENVOI AVEC CITATION
 * ========================= */
/**
 * Envoie une réponse en citant le message d'origine
 */
fonction asynchrone sendReply(sock, msg, contentObj, optionsExtra = {}) {
    const jid = msg.key.remoteJid;
    const opts = { quoted: msg, ...optionsExtra };
    console.log('🧷 sendReply -> citation stanzaId:', msg.key.id, '| à:', jid);
    renvoie sock.sendMessage(jid, contentObj, opts);
}

/**
 * Envoie une réponse avec un délai aléatoire et l'indicateur "en train d'écrire"
 * AVEC SIGNATURE INVISIBLE
 */
fonction asynchrone sendReplyWithTyping(sock, msg, contentObj, optionsExtra = {}) {
    const jid = msg.key.remoteJid;
    const opts = { quoted: msg, ...optionsExtra };

    // Délai aléatoire entre 2 et 5 secondes pour paraître plus humain
    const randomDelay = Math.floor(Math.random() * 3000) + 2000;

    // Activer l'indicateur "en train d'écrire"
    attendre sock.sendPresenceUpdate('composing', jid);

    // Attendre le délai aléatoire
    attendre délai(délai aléatoire);

    // Désactiver l'indicateur et envoyer le message
    attendre sock.sendPresenceUpdate('paused', jid);
    
    // Ajouter la signature invisible au texte
    si (contentObj.text) {
        contentObj.text = ajouterSignature(contentObj.text);
    }
    
    renvoie sock.sendMessage(jid, contentObj, opts);
}

/**
 * Télécharger le contenu d'un message média
 */
fonction asynchrone downloadMediaContent(msg, messageType) {
    essayer {
        const stream = await downloadContentFromMessage(msg.message[messageType], messageType.replace('Message', ''));
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        renvoie Buffer.concat(chunks);
    } attraper (erreur) {
        console.error('❌ Erreur téléchargement média:', error);
        renvoyer null ;
    }
}

/* =========================
 * GESTION DU CODE D'APPARITION
 * ========================= */
fonction asynchrone handlePairing(sock) {
    si (!sock.authState.creds.registered && !pair) {
        essayer {
            attendre délai(3000);
            const numeroPair = process.env.NUMERO_PAIR || '225xxxxxxxxxx';
            const code = await sock.requestPairingCode(numeroPair);
            console.log("🔗 CODE DE PAIRAGE : ", code);
            paire = vrai;
        } attraper (erreur) {
            console.error("❌ Erreur lors du couplage :", err.message);
        }
    }
}

/* =========================
 * PRINCIPAL DU MANIPULATEUR
 * ========================= */
fonction asynchrone startBot(sock, état) {
    soit BOT_JID = (sock.user && sock.user.id) || (state?.creds?.me?.id) || process.env.BOT_JID || null;

    // Gestion du code de pairing
    attendre handlePairing(sock);

    sock.ev.on('connection.update', (u) => {
        si (u.connection === 'open' && sock.user?.id) {
            BOT_JID = sock.user.id;
            console.log('✅ Connexion ouverte — Bot JID:', BOT_JID);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        essayer {
            const msg = messages && messages[0];
            si (!msg || !ms.message) retourner;

            // VÉRIFICATION ANTI-DOUBLON
            si (isDuplicateEvent(msg)) {
                console.log('🚫 Événement dupliqué ignoré:', msg.key.id);
                retour;
            }

            joliLog(msg);

            // Si c'est le bot qui parle → on met en cache et on sort
            si (msg.key.fromMe) {
                const texte = extraireTexte(msg);
                si (texte) cacheBotReply(msg.key.remoteJid, texte);
                retour;
            }

            const texte = extraireTexte(msg);
            const remoteJid = msg.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');
            const pushName = msg.pushName || msg.notifyName || nul;
            const messageType = getMessageType(msg);
            const senderJid = msg.key.participant || remoteJid;

            // ===========================================
            // DÉTECTION DES MENTIONS DU BOT
            // ===========================================
            const botNumbers = ['244285576339508', '177958127927437']; // Tous les numéros possibles
            const mots-clés = ['supremia', 'makima'];
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            
            const isMentioned =
                mentionedJids.some(jid => botNumbers.some(num => jid.includes(num))) ||
                (text && botNumbers.some(num => text.includes('@' + num))) ||
                (texte && mots-clés.some(mot => texte.toLowerCase().includes(mot)));

            // ===========================================
            // VÉRIFICATION RÉPONSE AU BOT (AVEC SIGNATURE)
            // ===========================================
            const quotedText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
                ? extraireTexteDeCitation(msg.message.extendedTextMessage.contextInfo)
                : nul;
            const isReplyToBot = quotedText && quotedMatchesBot(remoteJid, quotedText);

            // NOUVEAU : Vérifier si c'est une réponse à un autocollant du bot
            const quotedSticker = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
            const isReplyToBotSticker = quotedSticker && isReplyToBot;

            // ===========================================
            // NOUVELLE FONCTIONNALITÉ : ANALYZE DES MÉDIAS CITÉS
            // ===========================================
            soit quotedMediaBuffer = null;
            soit quotedMediaType = null ;
            soit quotedMediaMimeType = null ;
            soit transcribedQuotedAudio = null ;

            // Vérifier si l'utilisateur mentionne le bot sur un média cité
            si (isMentioned && msg.message?.extendedTextMessage?.contextInfo) {
                console.log('🔍 Mention détectée sur message cité, vérification média...');
                const quotedMedia = await downloadQuotedMedia(msg);
                
                si (quotedMedia) {
                    si (quotedMedia.type === 'image') {
                        console.log('📸 Image citée détectée avec mention - analyser démarrer');
                        quotedMediaBuffer = quotedMedia.buffer;
                        quotedMediaType = 'image';
                        quotedMediaMimeType = quotedMedia.mimeType;
                    } sinon si (quotedMedia.type === 'audio') {
                        console.log('🎤 Audio cité détectée avec mention - transcription démarre');
                        essayer {
                            transcriptionAudioCité = await transcriptionAudio(médiaCité.buffer);
                            si (transcribedQuotedAudio) {
                                console.log('✅ Transcription audio citée réussie :', transcritQuotedAudio);
                            } autre {
                                console.log('❌Échec transcription audio cité');
                            }
                        } attraper (erreur) {
                            console.error('❌ Erreur transcription audio cité:', error);
                        }
                    }
                }
            }

            // ===========================================
            // DÉTECTION DES VUES UNIQUES (VIEW UNE FOIS)
            // ===========================================
            soit viewOnceContent = null;
            si (messageType === 'viewOnceMessage') {
                viewOnceContent = extraireViewOnceContent(msg);
                console.log('👁️ Message viewUne fois détecté :', {
                    type : viewOnceContent?.type,
                    légende : viewOnceContent?.caption
                });
                
                // Conditions pour traiter les vues uniques :
                // - Mention OU réponse au bot OU privé
                const devraitProcessViewOnce = estMentionné || estRépondreAuBot || estÉtiquetteRépondreAuBot || !estGroupe;
                
                si (devraitTraiterViewOnce && viewOnceContent) {
                    console.log('📸 ViewOnce image à analyser - Conditions remplies');
                    
                    // Télécharger l'image viewOnce
                    si (viewOnceContent.type === 'imageMessage') {
                        essayer {
                            const stream = await downloadContentFromMessage(
                                viewOnceContent.message,
                                'image'
                            );
                            const chunks = [];
                            for await (const chunk of stream) {
                                chunks.push(chunk);
                            }
                            imageBuffer = Buffer.concat(chunks);
                            imageMimeType = viewOnceContent.message.mimetype;
                            console.log('📸 Image viewOnce téléchargée, taille:', imageBuffer?.length || 0, 'bytes');
                        } attraper (erreur) {
                            console.error('❌ Erreur de téléchargement de l'image viewOnce:', error);
                        }
                    }
                }
            }

            // ===========================================
            // GESTION DES MESSAGES DIRECTS AUDIO AVEC CONDITIONS AMÉLIORÉES
            // ===========================================
            soit transcribedAudioText = null ;
            si (messageType === 'audioMessage') {
                // CONDITIONS AUDIO ÉTENDUES :
                // - Mentionnez OU
                // - Réponse au bot (texte) OU
                // - Réponse à un autocollant du bot OU
                // - Discussion privée
                const devraitTranscribeAudio = estMentionné || estRépondreAuBot || estÉtiquetteRépondreAuBot || !estGroupe;
                
                si (devraitTranscribeAudio) {
                    console.log('🎤 Message audio détecté, transcription en cours... Conditions :', {
                        est mentionné,
                        estRépondreAuBot,
                        estRépondreAuBotSticker,
                        isPrivate: !isGroup
                    });
                    texteAudiotranscripté = await transcribeAudioMessage(msg);
                    
                    si (texteaudio transcrit) {
                        console.log('✅ Transcription audio réussie :', transcribeAudioText);
                    } autre {
                        console.log('❌ Échec de la transcription audio');
                        attendre sendReply(sock, msg, {
                            text: '❌ Désolé, je n\'ai pas pu comprendre le message audio. Pourriez-vous réessayer ou taper votre message ?'
                        });
                        retour;
                    }
                } autre {
                    console.log('🎤 Audio ignoré - Aucune condition de transcription remplie');
                }
            }

            // ===========================================
            // ANALYSE D'IMAGES CONDITIONNELLE CORRIGÉE
            // ===========================================
            soit imageBuffer = null;
            soit imageMimeType = null;

            if (messageType === 'imageMessage') {
                // CONDITION 1 : Image avec mention dans la légende
                const imageHasMention = isMentioned;
                
                // CONDITION 2 : Réponse à un message du bot AVEC image
                const isReplyToBotWithImage = isReplyToBot && messageType === 'imageMessage';
                
                // CONDITION 3 : Discussion privée (toutes les images analysées)
                const isPrivateImage = !isGroup;
                
                const devraitAnalyserImage = imageHasMention || isReplyToBotWithImage || isPrivateImage;
                
                si (devraitAnalyserImage) {
                    console.log('📸 Analyser l'image directement déclenchée - Conditions :', {
                        imageHasMention,
                        estRépondreAuBotAvecImage,
                        isPrivateImage
                    });
                    imageBuffer = await downloadMediaContent(msg, 'imageMessage');
                    imageMimeType = msg.message.imageMessage.mimetype;
                    console.log('📸 Image téléchargée, taille:', imageBuffer?.length || 0, 'bytes');
                } autre {
                    console.log('📸 Image directe ignorée - Aucune condition d\'analyse remplie');
                }
            }

            // ===========================================
            // GESTION DES STICKERS
            // ===========================================
            const isStickerMessage = messageType === 'stickerMessage';
            const isReplyWithSticker = isStickerMessage && (isReplyToBot || isMentioned || !isGroup);

            // Si l'utilisateur envoie un autocollant en réponse au bot, répondre par un autocollant
            si (isReplyWithSticker) {
                console.log('🎨 Réponse par autocollant déclenche');
                const stickerPath = attendre getRandomSticker();
                si (stickerPath) {
                    await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(stickerPath) }, { quoted: msg });
                    
                    // Mettre en cache la "réponse" sticker pour la détection future
                    cacheBotReply(remoteJid, "🎨 Autocollant envoyé");
                    
                    // Supprimer le fichier temporaire
                    essayer {
                        fs.unlinkSync(stickerPath);
                    } attraper (e) {
                        console.error('Erreur suppression sticker temporaire:', e);
                    }
                    retour; // Ne pas traiter plus loin
                }
            }

            // Si simple sticker sans contexte, ignorer
            si (isStickerMessage && !isReplyToBot && !isMentioned && isGroup) {
                console.log('🎨 Autocollant simple ignoré en groupe');
                retour;
            }

            // ===========================================
            // TEXTE FINAL À TRAITER
            // ===========================================
            // Priorité : transcription audio citée > transcription audio directe > texte normal
            const finalText = transcritQuotedAudio || transcritAudioTexte || texte;

            // Vérifier si c'est un message avec média mais sans texte
            si (!finalText && !imageBuffer && !quotedMediaBuffer && !viewOnceContent) {
                // Si c'est un message média sans légende, on ne le traite pas
                const isMedia = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'viewOnceMessage'].includes(messageType);
                si (isMedia && !transcribedAudioText && !transcribedQuotedAudio) {
                    console.log('📸 Message média sans légende - ignoré');
                    retour;
                }
            }

            // Rate limitation - éviter de répondre trop souvent
            si (!checkRateLimit(remoteJid, 2000)) {
                console.log('⏳ Limitation de débit activée pour ce chat');
                retour;
            }

            // Commande ?
            const isCommand = finalText && finalText.startsWith('/');

            // Vérifier si l'IA est désactivée pour cette discussion
            si (!isAIActive(remoteJid) && !isCommand) {
                console.log('🔕 IA désactivée pour cette discussion - ignoré');
                retour;
            }

            // ===========================================
            // DÉCISION DE RÉPONSE AMÉLIORÉE
            // ===========================================
            // Nouveaux critères : média cité avec mention
            const hasQuotedMediaWithMention = isMentioned && (quotedMediaBuffer || transcribedQuotedAudio);
            
            const devraitRépondre = !isGroup ||
                              estCommande ||
                              estRépondreAuBot ||
                              isReplyToBotSticker || //NOUVEAU
                              est mentionné ||
                              (imageBuffer && (isMentioned || isReplyToBot || !isGroup)) ||
                              Transcription audio/texte ||
                              Transcription de la citation audio ||
                              a cité des médias avec mention ||
                              (viewOnceContent && (isMentioned || isReplyToBot || !isGroup)); //NOUVEAU

            console.log(
                `📌 Décision : devraitRépondre=${shouldReply} | estGroupe=${isGroup} | estCommande=${isCommand} | estRépondreAuBot=${isReplyToBot} | estÉtiquetteRépondreAuBot=${isReplyToBotSticker} | estMentionné=${isMentioned} | aImage=${!!imageBuffer} | aVuUneFois=${!!viewOnceContent} | aImageCitée=${!!quotedMediaBuffer} | aAudio=${!!transcribedAudioText} | aAudioCité=${!!transcribedQuotedAudio} | IAActive=${isAIActive(remoteJid)}`
            );

            si (!devraitRépondre) retourner;

            essayer {
                laisser la réponse = null ;

                // 1) commandes
                si (estCommande) {
                    const [commande, ...args] = finalText.slice(1).trim().split(/\s+/);

                    // Commande réservée au propriétaire : /ai on/off
                    si (commande === 'ai' && isBotOwner(senderJid)) {
                        const action = args[0]?.toLowerCase();
                        si (action === 'on') {
                            définir AIStatus(remoteJid, vrai);
                            réponse = '✅ IA activée pour cette discussion';
                        } sinon si (action === 'off') {
                            setAIStatus(remoteJid, false);
                            réponse = '🔕 IA désactivée pour cette discussion';
                        } autre {
                            réponse = '❌ Utilisation : /ai on ou /ai off';
                        }
                    } autre {
                        réponse = await handleCommand(commande, args, msg, sock);
                    }

                    si (réponse) {
                        await sendReplyWithTyping(sock, msg, { text: reply });
                        cacheBotReply(remoteJid, réponse);
                        retour;
                    }
                }

                // 2) IA (mention / réponse / privé / image conditionnelle / audio / média cité)
                console.log(`🤖 IA: génération de réponse pour ${senderJid} dans ${remoteJid}`);

                // Récupérer l'analyse de la dernière image envoyée par le bot (si existe)
                const lastBotImageAnalysis = getLastBotImageAnalysis(remoteJid);
                si (lastBotImageAnalysis) {
                    console.log('🖼️ Analyse vision précédente disponible pour référence');
                }

                // Récupérer le nom du groupe pour le log
                soit groupName = null;
                si (estGroupe) {
                    nomGroupe = await getCachedGroupName(sock, remoteJid);
                    console.log(`🏷️ Groupe: "${groupName || 'Sans nom'}"`);
                }

                // Préparer les informations de citation pour l'IA
                const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                const quotedTextForAI = contextInfo?.quotedMessage ? extractTextFromQuoted(contextInfo) : null;
                const quotedSender = contextInfo?.participant || null;
                const quotedMessageInfo = quotedTextForAI && quotedSender ? { sender: quotedSender, text: quotedTextForAI } : null;

                // Déterminer le buffer d'image à utiliser (image directe OU image citée OU viewOnce)
                const finalImageBuffer = quotedMediaBuffer || imageBuffer;
                const finalImageMimeType = quotedMediaMimeType || imageMimeType;

                const réponseObj = attendre nazunaReply(
                    Texte final,
                    expéditeurJid,
                    Jid distant,
                    pushName,
                    estGroupe,
                    quotedMessageInfo,
                    tampon d'image final,
                    typeMime de l'image finale,
                    chaussette,
                    dernièreAnalyse d'image du robot,
                    transcritAudioTexte || transcritQuotedAudio ? true : false // Indiquer si c'est une transcription audio
                );

                si (replyObj && replyObj.text) {
                    // Détection de visuel
                    const visuel = detectorVisuel(finalText) || détecterVisuel(replyObj.text);

                    if (visuel && visuel.urlImage) {
                        // Envoyer l'image avec la réponse en légende
                        attendre sock.sendMessage(remoteJid, {
                            image : { url : visuel.urlImage },
                            légende : addSignature(replyObj.text), // Signature ajoutée
                            mentions : replyObj.mentions || []
                        }, { cité: msg });

                        // Analyser et stocker l'image envoyée pour le prochain message
                        attendre analyzeAndStoreBotImage(visuel.urlImage, remoteJid);

                        cacheBotReply(remoteJid, replyObj.text);
                    } autre {
                        // Envoi normal si pas de visuel détecté (signature ajoutée dans sendReplyWithTyping)
                        const messageData = {
                            text: ReplyObj.text, // La signature sera ajoutée dans sendReplyWithTyping
                            mentions : replyObj.mentions || []
                        };
                        attendre sendReplyWithTyping(sock, msg, messageData);
                        cacheBotReply(remoteJid, replyObj.text);
                    }
                }

                // 3) bonus sticker de temps en temps (seulement 50% de chance)
                si (!isCommand && Math.random() < 0.5) {
                    const stickerPath = attendre getRandomSticker();
                    si (stickerPath) {
                        await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(stickerPath) });

                        // Supprimer le fichier temporaire
                        essayer {
                            fs.unlinkSync(stickerPath);
                        } attraper (e) {
                            console.error('Erreur suppression sticker temporaire:', e);
                        }
                    }
                }
            } attraper (erreur) {
                console.error('❌ Erreur lors du traitement du message :', error);
                wait sendReply(sock, msg, { text: '❌ Désolé, une erreur est survenue. Veuillez réessayer plus tard.' });
            }
        } attraper (erreur) {
            console.error('❌ Erreur dans messages.upsert handler:', err);
        }
    });
}

/* =========================
 * PRINCIPAL
 * ========================= */
fonction asynchrone main() {
    essayer {
        // Attendre que la base de données soit initialisée
        attendre la synchronisation de la base de données();
        console.log('✅ Base de données PostgreSQL prête');

        const { état, enregistrer les identifiants } = await utiliserMultiFileAuthState('./auth');

        const sock = makeWASocket({
    auth: état,
    printQRInTerminal : faux,
    navigateur : ['Ubuntu', 'Chrome', '128.0.6613.86'],
    version : [2, 3000, 1025190524],
    getMessage: clé asynchrone => {
        console.log('⚠️ Message non déchiffré, retry demandé:', key);
        return { conversation: '🔄 Réessayez d\'envoyer ton message' };
    }
});

        sock.ev.on('creds.update', saveCreds);

        console.log('📱 Démarrage avec système de pairing code...');

        attendre startBot(sock, état);
    } attraper (erreur) {
        console.error('💥 Erreur fatale lors du démarrage:', error);
        processus.sortie(1);
    }
}

main().catch(err => {
    console.error('💥 Erreur fatale :', err?.stack || err);
    processus.sortie(1);
});

// Exporter des fonctions
module.exports = {
    est AdministrateurUtilisateur,
    estPropriétaireDuBot,
    Cache de messages du bot,
    extraireTexte,
    obtenirTypeDeMessage,
    téléchargerMediaContent,
    obtenir le nom du groupe mis en cache,
    analyserEtStockerBotImage,
    getLastBotImageAnalysis,
    définir l'état de l'IA,
    estIAActive,
    ajouterSignature,
    a une signature,
    supprimer la signature,
    transcrireMessageAudio,
    téléchargerQuotedMedia,
    extraire le contenu d'affichage unique
};