const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Utilisation du modèle Imagen 4.0
const imageModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image-preview" });

async function generateImage(prompt) {
    try {
        console.log('🎨 Génération image...');
        const result = await imageModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        });

        // Récupérer les données de l’image
        const base64Image = result.response.candidates[0].content.parts[0].inlineData.data;
        const buffer = Buffer.from(base64Image, "base64");

        return buffer;
    } catch (error) {
        console.error('❌ Erreur génération image:', error);
        return null;
    }
}

async function execute(args, msg, sock) {
    try {
        const jid = msg.key.remoteJid;
        const prompt = args.join(" ");

        if (!prompt) {
            return `🎨 *Création IA :*\n\nPour générer une image :\n• ✍️ Tapez "/image [description]"`;
        }

        const imageBuffer = await generateImage(prompt);

        if (!imageBuffer) {
            return "❌ Désolé, je n'ai pas pu générer cette image.";
        }

        await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: `🖼️ *IMAGE GÉNÉRÉE :*\n"${prompt}"`
        }, { quoted: msg });

    } catch (error) {
        console.error('❌ Erreur commande image:', error);
        return "❌ Une erreur est survenue pendant la génération.";
    }
}

module.exports = {
    name: 'image',
    description: 'Génère une image avec Makima Supremus',
    execute
};
