const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateImage(prompt) {
    try {
        console.log('🎨 Génération image...');

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-preview-image"
        });

        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ]
        });

        // ✅ Extraction correcte de l'image (base64)
        const imagePart = result.response.candidates[0].content.parts.find(
            (part) => part.inlineData && part.inlineData.mimeType.startsWith("image/")
        );

        if (!imagePart) throw new Error("Aucune image n'a été générée.");

        const buffer = Buffer.from(imagePart.inlineData.data, "base64");
        return buffer;

    } catch (error) {
        console.error("❌ Erreur génération image:", error);
        return null;
    }
}

async function execute(args, msg, sock) {
    try {
        const jid = msg.key.remoteJid;
        const prompt = args.join(" ");

        if (!prompt) {
            return `🎨 *Création IA :*\n\nPour générer une image :\n• ✍️ Tapez "/imagine [description]"`;
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
    name: 'imagine',
    description: 'Génère une image avec Makima Supremus',
    execute
};
