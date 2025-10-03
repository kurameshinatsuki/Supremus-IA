const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateImage(prompt) {
    try {
        console.log('🎨 Génération image...');
        
        // Utilisation du bon modèle et de la bonne méthode
        const model = genAI.getGenerativeModel({ 
            model: "gemini-flash-latest" 
        });

        const result = await model.generateImages({
            prompt: prompt,
            numberOfImages: 1, // Tu peux augmenter si besoin
            // Tu peux ajouter d'autres paramètres comme la taille
            // dimensions: { height: 1024, width: 1024 }
        });

        // Récupération de l'image
        const image = result.images[0];
        
        // Convertir en buffer pour WhatsApp
        const buffer = Buffer.from(await image.arrayBuffer());
        
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
