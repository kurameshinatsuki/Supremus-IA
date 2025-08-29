// === nazunaAI.js ===
require('dotenv').config();
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getMemory, saveMemory, addMessageToMemory } = require('./memoryManager');

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

    // 🔑 Charger mémoire perso
    const userData = await getMemory(sender) || { conversations: [] };

    // 🔑 Construire l'historique (limité aux 10-15 derniers messages pour éviter surconsommation)
    const history = (userData.conversations || []).slice(-10);

    const messages = [
      { role: "system", content: training },
      ...history.map(m => ({
        role: m.fromBot ? "assistant" : "user",
        content: m.text
      })),
      { role: "user", content: userText }
    ];

    // 🔑 Appel au modèle
    const result = await model.generateContent({
      contents: messages
    });

    const reply = result.response.text();

    // 🔑 Mise à jour mémoire
    await addMessageToMemory(sender, userText, false); // message user
    await addMessageToMemory(sender, reply, true);    // réponse bot

    return reply;

  } catch (err) {
    console.error("[NazunaAI] Erreur:", err);
    return "⚠️ Une erreur est survenue, réessayez plus tard.";
  }
}

module.exports = { nazunaReply };