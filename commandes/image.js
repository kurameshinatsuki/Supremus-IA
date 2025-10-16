const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateImage(prompt) {
  try {
    console.log("🎨 Génération image...");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-preview-image-generation",
    });

    // ✅ Appel avec generateContent (et non generateImage)
    const result = await model.generateContent([
      { role: "user", parts: [{ text: prompt }] },
    ]);

    // ✅ Récupération du Base64
    const base64 = result.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64) throw new Error("Aucune image reçue");

    const buffer = Buffer.from(base64, "base64");
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
