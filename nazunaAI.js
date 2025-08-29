// === nazunaAI.js ===
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialisation Gemini Flash
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Chemin absolu vers Training IA.json
const trainingPath = path.join(__dirname, 'Training IA.json');

// Variables pour cache
let trainingData = null;
let lastModified = null;

// Fonction pour charger le fichier si besoin
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

// Charger la mémoire des utilisateurs
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

/**
 * nazunaReply : Génère une réponse contextuelle avec mémoire des conversations
 * @param {string} userText - Texte envoyé par l'utilisateur.
 * @param {string} sender - Identifiant de l'expéditeur.
 * @param {string} remoteJid - Identifiant de la conversation (privé ou groupe).
 * @returns {Promise<{text: string, mentions: string[]}>} - Réponse générée par Gemini + mentions
 */
async function nazunaReply(userText, sender, remoteJid) {
    try {
        // Charger la mémoire et les données d'entraînement
        const memory = loadUserMemory();
        const training = loadTrainingData();

        // Récupérer le nom de l'utilisateur
        const userName = memory[sender]?.name || sender.split('@')[0];

        // Préparer le contexte de conversation
        let conversationContext = "";

        if (remoteJid.endsWith('@g.us')) {
            // Contexte de groupe - Gestion collective
            conversationContext = "Conversation de groupe récente:\n";

            if (!memory[remoteJid]) {
                memory[remoteJid] = { recentMessages: [] };
            }

            memory[remoteJid].recentMessages.push({
                sender: userName,
                text: userText,
                timestamp: Date.now()
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
                memory[sender] = { conversations: [] };
            }

            memory[sender].conversations.push({
                text: userText,
                timestamp: Date.now()
            });

            if (memory[sender].conversations.length > 0) {
                conversationContext = "Historique de notre conversation:\n" +
                    memory[sender].conversations
                        .slice(-50)
                        .map(c => `${userName}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        // Construire le prompt final
        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\n:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Mettre à jour la mémoire
        if (!memory[sender]) {
            memory[sender] = { name: userName, conversations: [] };
        }
        if (!memory[sender].conversations) {
            memory[sender].conversations = [];
        }

        memory[sender].conversations.push({
            text: userText,
            timestamp: Date.now()
        });

        memory[sender].conversations.push({
            text: text,
            timestamp: Date.now(),
            fromBot: true
        });

        if (memory[sender].conversations.length > 20) {
            memory[sender].conversations = memory[sender].conversations.slice(-20);
        }

        try {
            const memoryPath = path.join(__dirname, 'nazuna_memory.json');
            fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
        } catch (error) {
            console.error('Erreur sauvegarde mémoire:', error);
        }

        // Retourne texte + mentions
        return {
            text: text || "Mon IA est en cours de configuration... Reviens bientôt !",
            mentions: remoteJid.endsWith('@g.us') ? [sender] : [] // tag l'expéditeur en groupe
        };
    } catch (e) {
        console.error("[NazunaAI] Erreur:", e.message);
        return {
            text: "Mon IA est en cours de configuration... Reviens bientôt !",
            mentions: []
        };
    }
}

module.exports = { nazunaReply };