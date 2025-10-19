const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateImage(prompt) {
    try {
        console.log('🎨 Génération image...');

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash"
        });

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "image/png" }
        });

        const imagePart = result.response.candidates[0].content.parts.find(
            p => p.inlineData && p.inlineData.mimeType.startsWith("image/")
        );

        if (!imagePart) throw new Error("Aucune image générée.");

        const buffer = Buffer.from(imagePart.inlineData.data, "base64");
        return buffer;

    } catch (err) {
        console.error("❌ Erreur génération image:", err);
        return null;
    }
}

async function execute(args, msg, sock) {
    try {
        const jid = msg.key.remoteJid;
        const prompt = args.join(" ");
        if (!prompt) {
            return await sock.sendMessage(jid, { text: "🎨 Utilisation : /imagine [description]" }, { quoted: msg });
        }

        const image = await generateImage(prompt);
        if (!image) {
            return await sock.sendMessage(jid, { text: "❌ Désolé, je n'ai pas pu générer cette image." }, { quoted: msg });
        }

        await sock.sendMessage(jid, {
            image,
            caption: `🖼️ *Image générée :* ${prompt}`
        }, { quoted: msg });

    } catch (e) {
        console.error("Erreur commande imagine:", e);
        await sock.sendMessage(msg.key.remoteJid, { text: "❌ Erreur pendant la génération." }, { quoted: msg });
    }
}

module.exports = {
    name: "imagine",
    description: "Génère une image avec Makima",
    execute
};
