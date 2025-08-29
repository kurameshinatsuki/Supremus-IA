// === nazunaAI.js ===
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getMemory, addMessageToMemory } = require('./memoryManager');

// Initialisation Gemini Flash
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

async function nazunaReply(userText, sender, remoteJid) {
  try {
    const training = loadTrainingData();

    // Charger la mémoire perso
    const userData = await getMemory(sender) || { conversations: [] };
    const history = (userData.conversations || []).slice(-10);

    // Construire les messages au format Gemini
    const messages = [
      { role: "system", parts: [{ text: training }] },
      ...history.map(m => ({
        role: m.fromBot ? "model" : "user",
        parts: [{ text: m.text }]
      })),
      { role: "user", parts: [{ text: userText }] }
    ];

    // Appel Gemini
    const result = await model.generateContent({ contents: messages });

    // Récupération réponse
    const reply =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Je n'ai pas pu générer de réponse.";

    // Sauvegarder mémoire
    await addMessageToMemory(sender, userText, false);
    await addMessageToMemory(sender, reply, true);

    return reply;

  } catch (err) {
    console.error("[NazunaAI] Erreur:", err);
    return "⚠️ Une erreur technique est survenue.";
  }
}

module.exports = { nazunaReply };