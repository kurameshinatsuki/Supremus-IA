//     ===== nazunaAI.js =====     //

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const trainingPath = path.join(__dirname, 'Training IA.json');

let trainingData = null;
let lastModified = null;

function loadTrainingData() {
    try {
        const stats = fs.statSync(trainingPath);
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

function loadUserMemory() {
    try {
        const memoryPath = path.join(__dirname, 'nazuna_memory.json');
        if (fs.existsSync(memoryPath)) {
            const data = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
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

function saveUserMemory(memory) {
    try {
        const memoryPath = path.join(__dirname, 'nazuna_memory.json');
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch (error) {
        console.error('Erreur sauvegarde mémoire:', error);
    }
}

/**
 * Normalise un nom (minuscule, sans accents, espaces simplifiés)
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
 * Extrait le numéro d'un JID
 */
function extractNumberFromJid(jid) {
    return String(jid || "").split('@')[0];
}

async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false, quotedMessage = null) {
    try {
        const memory = loadUserMemory();
        const training = loadTrainingData();

        const userName = pushName || memory.users[sender]?.name || sender.split('@')[0];
        const userNumber = extractNumberFromJid(sender);

        if (!memory.users[sender]) {
            memory.users[sender] = { name: userName, number: userNumber, conversations: [] };
        } else {
            if (pushName && memory.users[sender].name !== pushName) {
                memory.users[sender].name = pushName;
            }
            if (memory.users[sender].number !== userNumber) {
                memory.users[sender].number = userNumber;
            }
        }

        let conversationContext = "";
        let mentionJids = []; // Stocker les JIDs pour les mentions
        let userMentions = []; // Stocker les mentions trouvées dans userText

        if (isGroup) {
            if (!memory.groups[remoteJid]) {
                memory.groups[remoteJid] = { participants: {}, lastMessages: [] };
            }
            if (pushName) {
                memory.groups[remoteJid].participants[sender] = { name: pushName, jid: sender, number: userNumber };
            }
            memory.groups[remoteJid].lastMessages.push({
                sender: sender,
                name: userName,
                text: userText,
                timestamp: Date.now()
            });
            if (memory.groups[remoteJid].lastMessages.length > 10) {
                memory.groups[remoteJid].lastMessages = memory.groups[remoteJid].lastMessages.slice(-10);
            }
            conversationContext = "Conversation de groupe:\n" +
                memory.groups[remoteJid].lastMessages
                    .map(m => `${m.name}: ${m.text}`)
                    .join('\n') + '\n\n';
        } else {
            if (memory.users[sender].conversations && memory.users[sender].conversations.length > 0) {
                conversationContext = "Historique de notre conversation:\n" +
                    memory.users[sender].conversations
                        .slice(-5)
                        .map(c => `${c.fromUser ? userName : 'Supremia'}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        if (quotedMessage) {
            const quotedSender = quotedMessage.sender;
            const quotedName = memory.users[quotedSender]?.name || memory.groups[remoteJid]?.participants[quotedSender]?.name || quotedSender.split('@')[0];
            conversationContext += `Message cité de ${quotedName}: ${quotedMessage.text}\n`;
        }

        // === Détection des tags dans le message utilisateur ===
        if (isGroup && userText) {
            const mentionRegex = /@(\d+)/g;
            let match;
            const participants = memory.groups[remoteJid]?.participants || {};
            while ((match = mentionRegex.exec(userText)) !== null) {
                const number = match[1];
                for (const [jid, info] of Object.entries(participants)) {
                    if (info.number === number) {
                        userMentions.push({ number, jid });
                        break;
                    }
                }
            }
        }

        // Ajouter la liste des participants au prompt
        let participantsList = "";
        if (isGroup && memory.groups[remoteJid]?.participants) {
            participantsList = "Participants du groupe (avec leurs numéros):\n";
            for (const [jid, info] of Object.entries(memory.groups[remoteJid].participants)) {
                participantsList += `- ${info.name} (@${info.number})\n`;
            }
            participantsList += "\n";
        }

        // Contexte supplémentaire si l'utilisateur a tagué des gens
        let mentionContext = "";
        if (userMentions.length > 0) {
            mentionContext = "L'utilisateur a mentionné les personnes suivantes: " +
                userMentions.map(u => `@${u.number}`).join(', ') + ".\n" +
                "Tu peux aussi les mentionner dans ta réponse si c'est pertinent.\n";
        }

        const prompt = `${training}\n\n${participantsList}${conversationContext}\n` +
            `${mentionContext}` +
            `TRÈS IMPORTANT: 
            - Pour mentionner quelqu'un, utilise toujours SON NUMÉRO avec le format @numéro
            - L'utilisateur actuel (${userName}) a pour numéro: @${userNumber}
            - N'utilise JAMAIS le nom pour les mentions car cela ne fonctionne pas
            - Si on te demande de "tag" ou "mentionner" quelqu'un, utilise toujours son numéro
            - Tu peux mentionner d'autres utilisateurs que ${userName} si c'est pertinent\n` +
            `${userName}: ${userText}\nSupremia:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = (response && response.text) ? response.text().trim() : '';

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
            if (memory.users[sender].conversations.length > 10) {
                memory.users[sender].conversations = memory.users[sender].conversations.slice(-10);
            }
        }

        // === Gestion des tags dans la réponse IA ===
        if (isGroup && text) {
            const mentionRegex = /@(\d+)/g;
            let match;
            const participants = memory.groups[remoteJid]?.participants || {};

            // Détecter toutes les mentions dans la réponse de l'IA
            while ((match = mentionRegex.exec(text)) !== null) {
                const number = match[1];
                for (const [jid, info] of Object.entries(participants)) {
                    if (info.number === number && !mentionJids.includes(jid)) {
                        mentionJids.push(jid);
                        break;
                    }
                }
            }

            // Si l'utilisateur demande explicitement à être tagué
            if (userText.toLowerCase().includes('tag moi') || userText.toLowerCase().includes('mentionne moi')) {
                if (!mentionJids.includes(sender)) {
                    mentionJids.push(sender);
                }
            }

            // Ajouter aussi les tags que l'utilisateur avait déjà faits
            for (const m of userMentions) {
                if (!mentionJids.includes(m.jid)) {
                    mentionJids.push(m.jid);
                }
            }
        }

        saveUserMemory(memory);

        return {
            text: text || "Désolé, je n'ai pas pu générer de réponse.",
            mentions: mentionJids
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