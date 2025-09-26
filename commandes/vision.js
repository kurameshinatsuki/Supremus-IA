const { GoogleGenerativeAI } = require('@google/generative-ai');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function analyzeImage(imageBuffer, imageMimeType) {
    try {
        const base64Image = imageBuffer.toString('base64');
        
        const prompt = `**Analyse cette image de manière détaillée et précise. Décris :**
       
        1. **EXTRAIT TEXTES VISIBLES** : Décris absolument tout le texte présent sur l'image (titre, sous-titre, description, etc)
        2. **ÉLÉMENTS PRINCIPAUX** : Ce qui est visible au premier plan
        3. **CONTEXTE** : L'arrière-plan et l'environnement
        4. **COULEURS** : La palette de couleurs dominante
        5. **AMBIANCE** : L'atmosphère générale
        6. **DÉTAILS REMARQUABLES** : Éléments spécifiques intéressants
        7. **INTENTION/ACTION** : Ce qui semble se passer
        
        Sois objectif et factuel dans ton analyse.`;

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
