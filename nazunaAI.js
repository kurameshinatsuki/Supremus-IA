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

        // Si c'est un groupe, inclure les conversations récentes de tous les participants
        if (remoteJid.endsWith('@g.us')) {
            conversationContext = "Conversation de groupe récente:\n";
            
            // Parcourir tous les utilisateurs dans la mémoire
            for (const [jid, userData] of Object.entries(memory)) {
                if (userData.conversations && userData.conversations.length > 0) {
                    const userConversations = userData.conversations
                        .slice(-5) // 5 derniers messages par utilisateur
                        .map(c => `${userData.name}: ${c.text}`)
                        .join('\n');
                    
                    conversationContext += userConversations + '\n';
                }
            }
        } else {
            // Conversation privée - inclure l'historique avec cet utilisateur
            if (memory[sender]?.conversations && memory[sender].conversations.length > 0) {
                conversationContext = "Historique de notre conversation:\n" +
                    memory[sender].conversations
                        .slice(-10) // 10 derniers messages
                        .map(c => `${userName}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        // Construire le prompt final
        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\n:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Mettre à jour la mémoire avec la nouvelle conversation
        if (!memory[sender]) {
            memory[sender] = { name: userName, conversations: [] };
        }
        
        if (!memory[sender].conversations) {
            memory[sender].conversations = [];
        }
        
        // Ajouter le message de l'utilisateur
        memory[sender].conversations.push({
            text: userText,
            timestamp: Date.now()
        });
        
        // Ajouter la réponse du bot
        memory[sender].conversations.push({
            text: text,
            timestamp: Date.now(),
            fromBot: true
        });
        
        // Garder seulement les 20 derniers messages
        if (memory[sender].conversations.length > 20) {
            memory[sender].conversations = memory[sender].conversations.slice(-20);
        }
        
        // Sauvegarder la mémoire
        try {
            const memoryPath = path.join(__dirname, 'nazuna_memory.json');
            fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
        } catch (error) {
            console.error('Erreur sauvegarde mémoire:', error);
        }

        return text || "Mon IA est en cours de configuration... Reviens bientôt !";
    } catch (e) {
        console.error("[NazunaAI] Erreur:", e.message);
        return "Mon IA est en cours de configuration... Reviens bientôt !";
    }
}

module.exports = { nazunaReply };