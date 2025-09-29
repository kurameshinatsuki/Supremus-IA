const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modèle le plus récent pour la génération d'images
const imageModel = genAI.getGenerativeModel({ model: "imagen-4.0-generate-001" });

async function generateImage(prompt) {
    try {
        console.log('🎨 Génération image...');
        const result = await imageModel.generateImage(prompt);

        // Récupérer l'image (format base64)
        const base64Image = result.images[0].imageData;
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

        // Générer l'image
        const imageBuffer = await generateImage(prompt);

        if (!imageBuffer) {
            return "❌ Désolé, je n'ai pas pu générer cette image.";
        }

        // Envoyer l'image générée
        await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: `🖼️ *IMAGE GÉNÉRÉE :*\n\n"${prompt}"`
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