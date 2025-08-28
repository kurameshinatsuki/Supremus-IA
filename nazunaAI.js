// === nazunaAI.js ===
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialisation Gemini Flash
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * nazunaReply : Génère une réponse naturelle et humaine.
 * @param {string} userText - Texte envoyé par l'utilisateur.
 * @param {string} sender - Identifiant de l'expéditeur.
 * @returns {Promise<string>} - Réponse générée par Gemini.
 */
async function nazunaReply(userText, sender) {
  try {
    const prompt = `Tu es Supremia, une fille sombre et detacher. Réponds comme une humaine naturelle sans jamais révéler que tu es une IA et avec des reponse bref.
    Contexte: ${userText}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return text || "Mon IA est en cours de configuration... Reviens bientôt !";
  } catch (e) {
    console.error("[NazunaAI] Erreur:", e.message);
    // En cas d'erreur, elle reste mystérieuse et humaine
    return "Mon IA est en cours de configuration... Reviens bientôt !";
  }
}

module.exports = { nazunaReply };