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
    const stats = fs.statSync(trainingPath); // Infos du fichier
    if (!lastModified || stats.mtime > lastModified) {
      // Le fichier a changé → recharger
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

/**
 * nazunaReply : Génère une réponse naturelle et humaine.
 * @param {string} userText - Texte envoyé par l'utilisateur.
 * @param {string} sender - Identifiant de l'expéditeur.
 * @returns {Promise<string>} - Réponse générée par Gemini.
 */
async function nazunaReply(userText, sender) {
  try {
    // Charger/mettre à jour le training data si besoin
    const training = loadTrainingData();

    // Construire le prompt final
    const prompt = `${training}\n\nContexte utilisateur (${sender}): ${userText}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return text || "Mon IA est en cours de configuration... Reviens bientôt !";
  } catch (e) {
    console.error("[NazunaAI] Erreur:", e.message);
    return "Mon IA est en cours de configuration... Reviens bientôt !";
  }
}

module.exports = { nazunaReply };