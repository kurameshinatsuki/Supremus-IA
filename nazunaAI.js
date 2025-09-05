// ===== nazunaAI.js ===== //
// Module principal de l'IA Nazuna utilisant Gemini API
// Gestion de la mémoire: 100 messages en privé, 500 en groupe

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialisation de l'API Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Chemins des fichiers de données
const trainingPath = path.join(__dirname, 'Training IA.json');

let trainingData = null;
let lastModified = null;

/**
 * Charge les données d'entraînement depuis le fichier JSON
 * Recharge automatiquement si le fichier a été modifié
 * @returns {string} Contenu du fichier d'entraînement
 */
function loadTrainingData() {
    try {
        const stats = fs.statSync(trainingPath);
        // Recharger seulement si modifié depuis la dernière lecture
        if (!lastModified || stats.mtime > lastModified) {
            trainingData = fs.readFileSync(trainingPath, 'utf-8');
            lastModified = stats.mtime;
            console.log("[NazunaAI] Training IA.json rechargé.");
        }
    } catch (err) {
        console.error("[NazunaAI] Erreur de lecture Training IA.json:", err.message);
        trainingData = "Contexte par défaut indisponible.";
    }
    return trainingData;
}

/**
 * Charge la mémoire utilisateur depuis le fichier JSON
 * Structure: { users: {}, groups: {} }
 * @returns {Object} Mémoire utilisateur chargée
 */
function loadUserMemory() {
    try {
        const memoryPath = path.join(__dirname, 'nazuna_memory.json');
        if (fs.existsSync(memoryPath)) {
            const data = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
            // Migration de l'ancien format vers le nouveau format
            if (data.users === undefined) {
                data.users = data;
                data.groups = {};
            }
            return data;
        }
    } catch (error) {
        console.error('Erreur lecture mémoire:', error);
    }
    return { users: {}, groups: {} };
}

/**
 * Sauvegarde la mémoire utilisateur dans le fichier JSON
 * @param {Object} memory - Données de mémoire à sauvegarder
 */
function saveUserMemory(memory) {
    try {
        const memoryPath = path.join(__dirname, 'nazuna_memory.json');
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch (error) {
        console.error('Erreur sauvegarde mémoire:', error);
    }
}

/**
 * Normalise un nom pour la comparaison (minuscule, sans accents, espaces simplifiés)
 * @param {string} name - Nom à normaliser
 * @returns {string} Nom normalisé
 */
function normalizeName(name) {
    return String(name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

/**
 * Extrait le numéro de téléphone d'un JID
 * @param {string} jid - JID complet (ex: 1234567890@s.whatsapp.net)
 * @returns {string} Numéro de téléphone extrait
 */
function extractNumberFromJid(jid) {
    return String(jid || "").split('@')[0];
}

/**
 * Fonction principale de génération de réponse de l'IA Nazuna
 * @param {string} userText - Message de l'utilisateur
 * @param {string} sender - JID de l'expéditeur
 * @param {string} remoteJid - JID du destinataire (groupe ou privé)
 * @param {string} pushName - Nom affiché de l'utilisateur
 * @param {boolean} isGroup - Si la conversation est un groupe
 * @param {Object} quotedMessage - Message cité (réponse à un message)
 * @returns {Object} Réponse avec texte et mentions
 */
async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false, quotedMessage = null) {
    try {
        // Chargement des données en mémoire
        const memory = loadUserMemory();
        const training = loadTrainingData();

        // Identification de l'utilisateur
        const userName = pushName || memory.users[sender]?.name || sender.split('@')[0];
        const userNumber = extractNumberFromJid(sender);

        // Mise à jour des informations utilisateur
        if (!memory.users[sender]) {
            memory.users[sender] = { 
                name: userName, 
                number: userNumber, 
                conversations: [] 
            };
        } else {
            // Mettre à jour le nom si différent
            if (pushName && memory.users[sender].name !== pushName) {
                memory.users[sender].name = pushName;
            }
            // Mettre à jour le numéro si différent
            if (memory.users[sender].number !== userNumber) {
                memory.users[sender].number = userNumber;
            }
        }

        let conversationContext = "";
        let mentionJids = []; // Stockage des JIDs pour les mentions

        // Gestion des conversations de groupe (mémoire: 500 derniers messages)
        if (isGroup) {
            if (!memory.groups[remoteJid]) {
                memory.groups[remoteJid] = { participants: {}, lastMessages: [] };
            }
            
            // Mise à jour des informations des participants
            if (pushName) {
                memory.groups[remoteJid].participants[sender] = { 
                    name: pushName, 
                    jid: sender, 
                    number: userNumber 
                };
            }
            
            // Ajout du message à l'historique du groupe
            memory.groups[remoteJid].lastMessages.push({
                sender: sender,
                name: userName,
                text: userText,
                timestamp: Date.now()
            });
            
            // Limitation à 500 messages maximum dans l'historique groupe
            if (memory.groups[remoteJid].lastMessages.length > 500) {
                memory.groups[remoteJid].lastMessages = memory.groups[remoteJid].lastMessages.slice(-500);
            }
            
            // Construction du contexte de conversation groupe
            conversationContext = "Conversation de groupe:\n" +
                memory.groups[remoteJid].lastMessages
                    .map(m => `${m.name}: ${m.text}`)
                    .join('\n') + '\n\n';
        } else {
            // Gestion des conversations privées (mémoire: 100 derniers messages)
            if (memory.users[sender].conversations && memory.users[sender].conversations.length > 0) {
                conversationContext = "Historique de notre conversation:\n" +
                    memory.users[sender].conversations
                        .slice(-30) // Utiliser les 30 derniers messages pour le contexte
                        .map(c => `${c.fromUser ? userName : 'Supremia'}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        // Ajout du message cité au contexte si présent
        if (quotedMessage) {
            const quotedSender = quotedMessage.sender;
            const quotedName = memory.users[quotedSender]?.name || 
                              memory.groups[remoteJid]?.participants[quotedSender]?.name || 
                              quotedSender.split('@')[0];
            conversationContext += `Message cité de ${quotedName}: ${quotedMessage.text}\n`;
        }

        // Construction de la liste des participants pour les groupes
        let participantsList = "";
        if (isGroup && memory.groups[remoteJid]?.participants) {
            participantsList = "Participants du groupe (avec leurs numéros):\n";
            for (const [jid, info] of Object.entries(memory.groups[remoteJid].participants)) {
                participantsList += `- ${info.name} (@${info.number})\n`;
            }
            participantsList += "\n";
        }

        // Construction du prompt complet pour l'IA
        const prompt = `${training}\n\n${participantsList}${conversationContext}\n` +
            `TRÈS IMPORTANT: 
            - Pour mentionner quelqu'un, utilise toujours SON NUMÉRO avec le format @numéro (ex: Salut, @22554191184) mais ne tag pas de façon consécutives juste par moment
            - L'utilisateur actuel (${userName}) a pour numéro: @${userNumber}
            - N'utilise JAMAIS le nom pour les mentions car cela ne fonctionne pas
            - Si on te demande de "tag" ou "mentionner" quelqu'un, utilise toujours son numéro\n` +
            `${userName}: ${userText}\nSupremia:`;

        // Génération de la réponse via l'API Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = (response && response.text) ? response.text().trim() : '';

        // Mise à jour de l'historique des conversations privées
        if (!isGroup) {
            memory.users[sender].conversations.push({
                text: userText,
                timestamp: Date.now(),
                fromUser: true
            });
            memory.users[sender].conversations.push({
                text: text,
                timestamp: Date.now(),
                fromBot: true
            });
            
            // Limitation à 500 messages maximum en conversation privée
            if (memory.users[sender].conversations.length > 100) {
                memory.users[sender].conversations = memory.users[sender].conversations.slice(-100);
            }
        }

        // Traitement des mentions dans les groupes
        if (isGroup && text) {
            const mentionRegex = /@(\d{5,})/g;
            let match;
            const participants = memory.groups[remoteJid]?.participants || {};

            // Recherche des mentions dans le texte de réponse
            while ((match = mentionRegex.exec(text)) !== null) {
                const number = match[1];
                // Correspondance des numéros avec les JIDs des participants
                for (const [jid, info] of Object.entries(participants)) {
                    if (info.number === number) {
                        mentionJids.push(jid);
                        break;
                    }
                }
            }

            // Élimination des doublons
            mentionJids = [...new Set(mentionJids)];

            // Nettoyage des mentions invalides
            text = text.replace(/@(\d{5,})/g, (full, num) => {
                const found = Object.values(participants).find(p => p.number === num);
                return found ? `@${num}` : num;
            });
        }

        // Sauvegarde de la mémoire mise à jour
        saveUserMemory(memory);

        return {
            text: text || "Désolé, je n'ai pas pu générer de réponse.",
            mentions: mentionJids // Liste des JIDs à mentionner
        };
    } catch (e) {
        console.error("[NazunaAI] Erreur:", e?.stack || e);
        return {
            text: "*Je suis épuisée, écris-moi plus tard.*",
            mentions: []
        };
    }
}

module.exports = { nazunaReply };