// === nazunaAI.js ===
require('dotenv').config();
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getMemory } = require('./memoryManager');

// Initialisation Gemini Flash
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const trainingPath = path.join(__dirname, 'Training IA.json');
let trainingData = null;
let lastModified = null;

function loadTrainingData() {
    try {
        const fs = require('fs');
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

async function nazunaReply(userText, sender, remoteJid) {
    try {
        const training = loadTrainingData();
        const userData = await getMemory(sender) || {};
        
        // CONVERTIR les conversations si nécessaire
        const conversations = typeof userData.conversations === 'string' 
            ? JSON.parse(userData.conversations) 
            : userData.conversations || [];
        
        const userName = userData.name || sender.split('@')[0];

        let conversationContext = "";
        if (conversations.length > 0) {
            conversationContext = "Historique récent:\n" +
                conversations.slice(-8)
                    .map(c => `${c.fromBot ? 'Supremia' : userName}: ${c.text}`)
                    .join('\n') + '\n';
        }

        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\n:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim() || "Désolé, je n'ai pas compris...";

    } catch (e) {
        console.error("[NazunaAI] Erreur:", e.message);
        return "Mon IA est en configuration. Réessaie plus tard !";
    }
}

module.exports = { nazunaReply };