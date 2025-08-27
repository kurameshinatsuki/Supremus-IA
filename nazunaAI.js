// === nazunaAI.js ===
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialisation Gemini Flash
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function nazunaReply(userText, sender) {
  try {
    // Vérifier si la clé API est configurée
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'AIzaSyAOgSPj1NU_XGE7VkVkCXSfksI5wo7C_co') {
      return "Mon IA est en cours de configuration... Reviens bientôt !";
    }

    const prompt = `Tu es Supremia, une fille sombre et detacher. Réponds comme une humaine naturelle sans jamais révéler que tu es une IA et avec des reponse bref.
    Contexte: ${userText}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // CORRECTION ICI : Ne pas utiliser || qui cache les vraies réponses
    if (text && text.length > 0) {
        return text;
    } else {
        return "Hmm... je réfléchis encore, dis-m'en plus~";
    }
    
  } catch (e) {
    console.error("[NazunaAI] Erreur:", e.message);
    
    // Messages d'erreur plus variés
    const errorMessages = [
        "Hmm... je réfléchis encore, dis-m'en plus~",
        "Mon esprit vagabonde... redis ça ?",
        "Intéressant... continue !",
        "J'ai besoin de plus de contexte..."
    ];
    return errorMessages[Math.floor(Math.random() * errorMessages.length)];
  }
}

module.exports = { nazunaReply };