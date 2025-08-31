// nazunaAI.js - Version améliorée avec meilleure identification
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
            return JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        }
    } catch (error) {
        console.error('Erreur lecture mémoire:', error);
    }
    return {};
}

function saveUserMemory(memory) {
    try {
        const memoryPath = path.join(__dirname, 'nazuna_memory.json');
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch (error) {
        console.error('Erreur sauvegarde mémoire:', error);
    }
}

// Fonction pour récupérer les infos utilisateur depuis le message
async function getUserInfo(senderJid, sock, remoteJid) {
    try {
        // Essayer de récupérer les infos du contact
        const contact = await sock.fetchContacts([senderJid]);
        if (contact && contact[0] && contact[0].name) {
            return contact[0].name;
        }
        
        // Pour les groupes, essayer de récupérer le nom du participant
        if (remoteJid.endsWith('@g.us')) {
            const groupMetadata = await sock.groupMetadata(remoteJid);
            const participant = groupMetadata.participants.find(p => p.id === senderJid);
            if (participant && participant.name) {
                return participant.name;
            }
        }
    } catch (error) {
        console.error("Erreur récupération infos utilisateur:", error.message);
    }
    return senderJid.split('@')[0]; // Fallback: numéro sans @
}

async function nazunaReply(userText, sender, remoteJid, sock) {
    try {
        const memory = loadUserMemory();
        const training = loadTrainingData();

        // Récupérer le nom de l'utilisateur (amélioré)
        let userName = memory[sender]?.name;
        if (!userName && sock) {
            userName = await getUserInfo(sender, sock, remoteJid);
            if (!memory[sender]) memory[sender] = {};
            memory[sender].name = userName;
        }
        userName = userName || sender.split('@')[0];

        let conversationContext = "";
        const maxContextLength = 3000;

        // Ajouter l'identification de l'utilisateur dans le contexte
        const userIdentity = `Utilisateur: ${userName} (${sender})\n`;

        if (remoteJid.endsWith('@g.us')) {
            if (!memory[remoteJid]) {
                memory[remoteJid] = { recentMessages: [], groupName: remoteJid };
            }

            conversationContext = "Conversation de groupe récente:\n";

            memory[remoteJid].recentMessages.push({
                sender: userName,
                text: userText,
                timestamp: Date.now(),
                userId: sender
            });

            const maxGroupMessages = 50;
            memory[remoteJid].recentMessages = memory[remoteJid].recentMessages.slice(-maxGroupMessages);

            const groupMessagesForContext = memory[remoteJid].recentMessages
                .map(msg => `${msg.sender}: ${msg.text}`)
                .join('\n');

            conversationContext += groupMessagesForContext + '\n';

            if (memory[sender]?.conversations?.length > 0) {
                conversationContext += "\nDernier échange en privé avec moi:\n";
                const lastPrivateMsg = memory[sender].conversations.slice(-1)[0]; 
                conversationContext += `${userName}: ${lastPrivateMsg.text}\n`;
            }

        } else {
            if (!memory[sender]) {
                memory[sender] = { name: userName, conversations: [] };
            }

            memory[sender].conversations.push({
                text: userText,
                timestamp: Date.now(),
                userId: sender
            });

            const maxPrivateMessages = 20;
            memory[sender].conversations = memory[sender].conversations.slice(-maxPrivateMessages);

            if (memory[sender].conversations.length > 0) {
                conversationContext = "Historique de notre conversation:\n" +
                    memory[sender].conversations
                        .slice(-10)
                        .map(c => `${userName}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        conversationContext = userIdentity + conversationContext.slice(0, maxContextLength);

        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\nNazuna:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        if (remoteJid.endsWith('@g.us')) {
            memory[remoteJid].recentMessages.push({
                sender: 'Nazuna',
                text: text,
                timestamp: Date.now(),
                fromBot: true
            });
            memory[remoteJid].recentMessages = memory[remoteJid].recentMessages.slice(-50);
        } else {
            memory[sender].conversations.push({
                text: text,
                timestamp: Date.now(),
                fromBot: true
            });
            memory[sender].conversations = memory[sender].conversations.slice(-20);
        }

        saveUserMemory(memory);

        return text || "Mon IA est en cours de configuration... Reviens bientôt !";
    } catch (e) {
        console.error("[NazunaAI] Erreur:", e.message);
        return "Mon IA est en cours de configuration... Reviens bientôt !";
    }
}

module.exports = { nazunaReply };