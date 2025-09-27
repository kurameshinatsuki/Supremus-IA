const { GoogleGenerativeAI } = require('@google/generative-ai');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function analyzeImage(imageBuffer, imageMimeType) {
    try {
        const base64Image = imageBuffer.toString('base64');
        
        const prompt = `
Analyse cette image de manière factuelle et précise :

1. **TEXTES VISIBLES** : retranscris absolument tout le texte présent (titres, sous-titres, descriptions, etc.)
2. **CONTENU VISUEL** : décris l’ensemble du reste (éléments, contexte, couleurs, ambiance, détails et actions)
`;

        const result = await visionModel.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Image,
                    mimeType: imageMimeType
                }
            }
        ]);

        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('❌ Erreur analyse image:', error);
        return "Je n'ai pas pu analyser cette image.";
    }
}

async function execute(args, msg, sock) {
    try {
        const jid = msg.key.remoteJid;
        
        // Vérifier si le message actuel contient une image
        let imageMessage = msg.message?.imageMessage;
        let quotedImage = null;

        // Vérifier si c'est une réponse à une image
        if (!imageMessage && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            quotedImage = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
        }

        const targetImage = imageMessage || quotedImage;

        if (!targetImage) {
            return `👁️ *Vision IA*\n\nPour analyser une image :\n• 📷 Envoyez une photo avec "/vision" comme légende\n• 🔄 Ou répondez "/vision" à une image existante\n\n*Je décrirai ce que je vois sur l'image*`;
        }

        // Télécharger l'image
        console.log('📥 Téléchargement image...');
        const stream = await downloadContentFromMessage(targetImage, 'image');
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const imageBuffer = Buffer.concat(chunks);

        // Analyser l'image
        console.log('🔍 Analyse en cours...');
        const analysis = await analyzeImage(imageBuffer, targetImage.mimetype);
        
        return `📸 *Description de l'image :*\n\n${analysis}`;

    } catch (error) {
        console.error('❌ Erreur commande vision:', error);
        return "❌ Désolé, je n'ai pas pu analyser l'image. Veuillez réessayer.";
    }
}

module.exports = {
    name: 'vision',
    description: 'Analyse une image avec Makima Supremus',
    execute
};
