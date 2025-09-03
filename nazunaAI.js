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

async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false, quotedMessage = null) {
    try {
        const memory = loadUserMemory();
        const training = loadTrainingData();

        const userName = pushName || memory.users[sender]?.name || sender.split('@')[0];

        if (!memory.users[sender]) {
            memory.users[sender] = { name: userName, conversations: [] };
        } else if (pushName && memory.users[sender].name !== pushName) {
            memory.users[sender].name = pushName;
        }

        let conversationContext = "";
        let mentionJids = []; // Stocker les JIDs pour les mentions

        if (isGroup) {
            if (!memory.groups[remoteJid]) {
                memory.groups[remoteJid] = { participants: {}, lastMessages: [] };
            }
            if (pushName) {
                // Stocker le jid et le nom
                memory.groups[remoteJid].participants[sender] = { name: pushName, jid: sender };
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

        const prompt = `${training}\n\n${conversationContext}\n` +
            `Important: Quand tu veux interpeller quelqu'un en groupe, utilise son nom ou tag le @<numéro> (ex: Makima Supremia ou @111536592965872). ` +
            `Je (le bot) convertirai ces @<numero> en mentions cliquable.\n` +
            `${userName}: ${userText}\nSupremia:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = (response && response.text) ? response.text().trim() : '';

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

        // Si c'est un groupe, on cherche les mentions @numéro dans la réponse
        if (isGroup && text) {
            const mentionRegex = /@(\d+)/g;
            let match;
            const participants = memory.groups[remoteJid]?.participants || {};
            
            while ((match = mentionRegex.exec(text)) !== null) {
                const number = match[1];
                // Chercher le participant correspondant au numéro (le jid est stocké sous forme de numéro@lid)
                for (const [jid, info] of Object.entries(participants)) {
                    const participantNumber = jid.split('@')[0];
                    if (participantNumber === number) {
                        mentionJids.push(jid);
                        break;
                    }
                }
            }
        }

        saveUserMemory(memory);

        return {
            text: text || "Désolé, je n'ai pas pu générer de réponse.",
            mentions: mentionJids // Retourner les JIDs à mentionner
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