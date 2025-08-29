// === nazunaAI.js === 
require('dotenv').config();
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getMemory } = require('./memoryManager');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
        temperature: 0.4, // Plus bas = plus cohérent
        topP: 0.8,
        maxOutputTokens: 512,
    }
});

const trainingPath = path.join(__dirname, 'Training IA.json');
let trainingData = null;
let lastModified = null;

function loadTrainingData() {
    try {
        const fs = require('fs');
        if (fs.existsSync(trainingPath)) {
            const stats = fs.statSync(trainingPath);
            if (!lastModified || stats.mtime > lastModified) {
                trainingData = fs.readFileSync(trainingPath, 'utf-8');
                lastModified = stats.mtime;
                console.log("[NazunaAI] Training IA.json rechargé.");
            }
        } else {
            trainingData = `Tu es Supremia, assistante personnelle de SUPREMUS PROD. 
Tu es professionnelle, précise et toujours concentrée sur la conversation actuelle.
Tu t'adresses toujours personnellement à l'utilisateur.`;
        }
    } catch (err) {
        console.error("[NazunaAI] Erreur Training IA:", err.message);
        trainingData = "Tu es Supremia, assistante personnelle de SUPREMUS PROD.";
    }
    return trainingData;
}

function safeParseConversations(conversations) {
    try {
        if (!conversations) return [];
        if (Array.isArray(conversations)) return conversations;
        if (typeof conversations === 'string') return JSON.parse(conversations);
        return [];
    } catch (error) {
        console.error("Erreur parsing conversations:", error);
        return [];
    }
}

async function nazunaReply(userText, sender, remoteJid) {
    try {
        const training = loadTrainingData();
        const userData = await getMemory(sender) || {};
        
        // SEULEMENT les conversations de CET utilisateur
        const conversations = safeParseConversations(userData.conversations);
        const userName = userData.name || sender.split('@')[0] || "Utilisateur";

        // CONTEXTE COURT et CIBLÉ (max 4 messages)
        let recentContext = "";
        if (conversations.length > 0) {
            const recentMessages = conversations.slice(-4); // Seulement 4 derniers
            recentContext = "Conversation récente avec " + userName + ":\n" +
                recentMessages.map(c => 
                    `${c.fromBot ? 'Supremia' : userName}: ${c.text}`
                ).join('\n') + '\n';
        }

        // PROMPT EXPLICITE avec CONTEXTE ISOLÉ
        const prompt = `${training}

CONCENTRE-TOI UNIQUEMENT SUR CETTE CONVERSATION AVEC ${userName}.

${recentContext}

${userName}: ${userText}

Supremia (réponds uniquement à ${userName}):`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

        // Nettoyer la réponse si elle contient d'autres noms
        if (text.includes('Utilisateur:') || text.includes('@')) {
            text = text.replace(/Utilisateur:/g, userName + ":")
                      .replace(/@\d+/g, userName);
        }

        return text || `Je vous écoute, ${userName}. Comment puis-vous aider ?`;

    } catch (e) {
        console.error("[NazunaAI] Erreur:", e.message);
        return "Un instant, je rencontre une difficulté technique.";
    }
}

module.exports = { nazunaReply };