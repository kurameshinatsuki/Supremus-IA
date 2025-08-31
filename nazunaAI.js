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

async function nazunaReply(userText, sender, remoteJid) {
    try {
        const memory = loadUserMemory();
        const training = loadTrainingData();

        const userName = memory[sender]?.name || sender.split('@')[0];
        let conversationContext = "";

        // Initialiser la mémoire utilisateur si nécessaire
        if (!memory[sender]) {
            memory[sender] = { name: userName, conversations: [] };
        }

        // Construire le contexte de conversation
        if (memory[sender].conversations && memory[sender].conversations.length > 0) {
            conversationContext = "Historique de notre conversation:\n" +
                memory[sender].conversations
                    .slice(-5) // 5 derniers messages seulement
                    .map(c => `${c.fromUser ? userName : 'Nazuna'}: ${c.text}`)
                    .join('\n') + '\n';
        }

        // Construire le prompt final
        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\nNazuna:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Ajouter le message de l'utilisateur à l'historique
        memory[sender].conversations.push({
            text: userText,
            timestamp: Date.now(),
            fromUser: true
        });

        // Ajouter la réponse du bot à l'historique
        memory[sender].conversations.push({
            text: text,
            timestamp: Date.now(),
            fromBot: true
        });

        // Garder seulement les 10 derniers messages
        if (memory[sender].conversations.length > 10) {
            memory[sender].conversations = memory[sender].conversations.slice(-10);
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