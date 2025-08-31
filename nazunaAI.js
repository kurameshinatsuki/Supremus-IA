// nazunaAI.js
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

// Sauvegarder la mémoire
function saveUserMemory(memory) {
    try {
        const memoryPath = path.join(__dirname, 'nazuna_memory.json');
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch (error) {
        console.error('Erreur sauvegarde mémoire:', error);
    }
}

/**
 * nazunaReply : Génère une réponse contextuelle avec mémoire des conversations
 * @param {string} userText - Texte envoyé par l'utilisateur.
 * @param {string} sender - Identifiant de l'expéditeur.
 * @param {string} remoteJid - Identifiant de la conversation (privé ou groupe).
 * @returns {Promise<string>} - Réponse générée par Gemini.
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
        const maxContextLength = 3000; // Limite de caractères pour le contexte

        if (remoteJid.endsWith('@g.us')) {
            // Contexte de groupe - Gestion collective
            conversationContext = "Conversation de groupe récente:\n";

            // S'assure que le groupe existe dans la mémoire
            if (!memory[remoteJid]) {
                memory[remoteJid] = { recentMessages: [] };
            }

            // Ajouter le message actuel à l'historique du groupe
            memory[remoteJid].recentMessages.push({
                sender: userName,
                text: userText,
                timestamp: Date.now()
            });

            // Limiter à 50 messages maximum
            const maxGroupMessages = 50;
            memory[remoteJid].recentMessages = memory[remoteJid].recentMessages.slice(-maxGroupMessages);

            // Construit le contexte en formatant les messages du groupe
            const groupMessagesForContext = memory[remoteJid].recentMessages
                .map(msg => `${msg.sender}: ${msg.text}`)
                .join('\n');

            conversationContext += groupMessagesForContext + '\n';

            // Ajouter le contexte des conversations privées si disponible
            if (memory[sender]?.conversations?.length > 0) {
                conversationContext += "\nDernier échange en privé avec moi:\n";
                const lastPrivateMsg = memory[sender].conversations.slice(-1)[0]; 
                conversationContext += `${userName}: ${lastPrivateMsg.text}\n`;
            }

        } else {
            // Conversation privée
            if (!memory[sender]) {
                memory[sender] = { name: userName, conversations: [] };
            }

            // Ajouter le message actuel à l'historique
            memory[sender].conversations.push({
                text: userText,
                timestamp: Date.now()
            });

            // Limiter à 20 messages maximum
            const maxPrivateMessages = 20;
            memory[sender].conversations = memory[sender].conversations.slice(-maxPrivateMessages);

            // Construit le contexte avec l'historique personnel
            if (memory[sender].conversations.length > 0) {
                conversationContext = "Historique de notre conversation:\n" +
                    memory[sender].conversations
                        .slice(-10) // 10 derniers messages seulement
                        .map(c => `${userName}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        // Limiter la taille du contexte
        conversationContext = conversationContext.slice(0, maxContextLength);

        // Construire le prompt final
        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\nNazuna:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Ajouter la réponse du bot à la mémoire
        if (remoteJid.endsWith('@g.us')) {
            // En groupe, ajouter la réponse à l'historique du groupe
            memory[remoteJid].recentMessages.push({
                sender: 'Nazuna',
                text: text,
                timestamp: Date.now(),
                fromBot: true
            });
            memory[remoteJid].recentMessages = memory[remoteJid].recentMessages.slice(-50);
        } else {
            // En privé, ajouter à l'historique de l'utilisateur
            memory[sender].conversations.push({
                text: text,
                timestamp: Date.now(),
                fromBot: true
            });
            memory[sender].conversations = memory[sender].conversations.slice(-20);
        }

        // Sauvegarder la mémoire
        saveUserMemory(memory);

        return text || "Mon IA est en cours de configuration... Reviens bientôt !";
    } catch (e) {
        console.error("[NazunaAI] Erreur:", e.message);
        return "Mon IA est en cours de configuration... Reviens bientôt !";
    }
}

module.exports = { nazunaReply };