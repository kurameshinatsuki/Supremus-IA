// === nazunaAI.js ===
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config'); // Import de la configuration

// Initialisation Gemini avec la config
const genAI = new GoogleGenerativeAI(config.ai.apiKey);
const model = genAI.getGenerativeModel({ 
  model: config.ai.model,
  generationConfig: {
    temperature: config.ai.temperature,
    maxOutputTokens: config.ai.maxOutputTokens,
  }
});

async function nazunaReply(userText, sender) {
  try {
    console.log(`🤖 Requête reçue: "${userText.substring(0, 50)}..."`);

    // Vérifier si la clé API est configurée
    if (!config.ai.apiKey || config.ai.apiKey.includes('AIzaSy')) {
      console.log('❌ Clé API non configurée ou par défaut');
      return "Mon IA est en cours de configuration... Reviens bientôt !";
    }

    const prompt = `Tu es ${config.bot.name}, une fille sombre et détachée. Réponds comme une humaine naturelle sans jamais révéler que tu es une IA et avec des réponses brèves.
    
Message: ${userText}

Réponds de façon concise et naturelle.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    if (text && text.length > 0) {
      console.log(`✅ Réponse générée: "${text.substring(0, 70)}..."`);
      return text;
    } else {
      console.log('⚠️ Réponse vide de Gemini');
      return "Hmm... je réfléchis encore, dis-m'en plus~";
    }

  } catch (e) {
    console.error("[NazunaAI] Erreur:", e.message);

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