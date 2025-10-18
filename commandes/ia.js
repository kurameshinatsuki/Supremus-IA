// ./commandes/ia.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Chemins des fichiers de données
const trainingPath = path.join(__dirname, 'Training IA.json');

let trainingData = null;
let lastModified = null;

// Initialiser la base de données
// syncDatabase(); // COMMENTÉ - Fonction non définie dans ce fichier

/**
 * Charge les données d'entraînement depuis le fichier JSON
 */
function loadTrainingData() {
  try {
    const stats = fs.statSync(trainingPath);
    if (!lastModified || stats.mtime > lastModified) {
      trainingData = fs.readFileSync(trainingPath, 'utf-8');
      lastModified = stats.mtime;
      console.log("[NazunaAI] Training IA.json rechargé.");
    }
  } catch (err) {
    console.error("[NazunaAI] Erreur de lecture Training IA.json:", err.message);
    trainingData = "Contexte par défaut indisponible.";
  }
  return trainingData;
}

async function analyzeImage(imageBuffer, imageMimeType) {
    try {
        const base64Image = imageBuffer.toString('base64');
        
        // CHANGEMENT : Charger les données d'entraînement ici
        const training = loadTrainingData();

        const prompt = `${training}

Analyse cette image et réponds EXCLUSIVEMENT sous ce format :

**CONTENU TEXTUEL :**
[Retranscris tout le texte visible]

**CONTEXTE VISUEL :**
[Description concise : 
- Type d'interface (menu, écran de sélection, carte de jeu, etc.)
- Éléments interactifs identifiés et leur couleur (boutons, curseurs, icônes)
- Design global (moderne, rétro, épuré, etc.)
- Émotions/atmosphère suggérée]

**IDENTIFICATION :**
[Lier explicitement les éléments à la base de connaissance :
- "Ceci correspond au personnage [nom] de ABM avec ses compétences [X]"
- "Interface du jeu [nom] montrant [fonction spécifique]"
- "Élément de gameplay [mécanique identifiée]"]
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

// Commande vision
async function executeVision(args, msg, sock) {
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
    execute: executeVision
};