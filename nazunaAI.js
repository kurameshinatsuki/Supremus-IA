// nazunaAI.js - Version corrigée
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
        let mentionObjects = []; // { jid, name, raw }

        if (isGroup) {
            if (!memory.groups[remoteJid]) {
                memory.groups[remoteJid] = { participants: {}, lastMessages: [] };
            }
            if (pushName) {
                memory.groups[remoteJid].participants[sender] = pushName;
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
                        .map(c => `${c.fromUser ? userName : 'Nazuna'}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        if (quotedMessage) {
            const quotedSender = quotedMessage.sender;
            const quotedName = memory.users[quotedSender]?.name || memory.groups[remoteJid]?.participants[quotedSender] || quotedSender.split('@')[0];
            conversationContext += `Message cité de ${quotedName}: ${quotedMessage.text}\n`;
        }

        const prompt = `${training}\n\n${conversationContext}\n` +
            `Important: Quand tu veux interpeller quelqu’un en groupe, utilise @Nom (ex: @Alice, @John Suprêmus). ` +
            `Je (le bot) convertirai ces @Nom en mentions réelles.\n` +
            `${userName}: ${userText}\nNazuna:`;

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

        saveUserMemory(memory);

        if (isGroup && text) {
            const mentionRegex = /@([^\n\r]+)/g;
            let match;
            while ((match = mentionRegex.exec(text)) !== null) {
                const rawMention = match[1].trim();
                const normalizedMention = normalizeName(rawMention);

                for (const [jid, name] of Object.entries(memory.groups[remoteJid].participants)) {
                    // On suppose que jid = lid complet
                    if (normalizeName(name).startsWith(normalizedMention)) {
                        mentionObjects.push({ jid, name, raw: rawMention });
                        break;
                    }
                }
            }
        }

        return {
            text: text || "Désolé, je n'ai pas pu générer de réponse.",
            mentions: mentionObjects
        };
    } catch (e) {
        console.error("[NazunaAI] Erreur:", e?.stack || e);
        return {
            text: "Désolé, je rencontre un problème technique. Veuillez réessayer.",
            mentions: []
        };
    }
}

module.exports = { nazunaReply };