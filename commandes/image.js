const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateImage(prompt) {
  try {
    console.log("🎨 Génération image...");

    // ✅ Utiliser le bon modèle pour la génération d'image
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-image",
    });

    const result = await model.generateImage({
      prompt,
      // Tu peux ajouter des options comme :
      // size: "1024x1024", aspectRatio: "1:1"
    });

    // ✅ La réponse est différente ici : elle contient un buffer base64
    const imageBase64 = result.data[0].b64_json;
    const buffer = Buffer.from(imageBase64, "base64");

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

    await sock.sendMessage(
      jid,
      {
        image: imageBuffer,
        caption: `🖼️ *IMAGE GÉNÉRÉE :*\n"${prompt}"`,
      },
      { quoted: msg }
    );
  } catch (error) {
    console.error("❌ Erreur commande image:", error);
    return "❌ Une erreur est survenue pendant la génération.";
  }
}

module.exports = {
  name: "imagine",
  description: "Génère une image avec Makima Supremus",
  execute,
};
