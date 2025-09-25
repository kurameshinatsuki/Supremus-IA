const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Initialisation des modèles
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const conversationModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Traite une image avec Google Vision
 */
async function analyzeImage(imageBuffer, imageMimeType) {
    try {
        // Convertir l'image en base64 pour l'API Gemini
        const base64Image = imageBuffer.toString('base64');
        
        const prompt = `
        Analyse cette image de manière détaillée. Décris :
        1. Les éléments principaux visibles
        2. Les couleurs dominantes
        3. Le contexte ou l'ambiance
        4. Les textes éventuels
        5. Les détails remarquables
        
        Sois précis et exhaustif dans ta description.
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
        throw new Error('Impossible d\'analyser l\'image');
    }
}

/**
 * Combine l'analyse d'image avec le contexte de conversation
 */
async function generateImageResponse(imageAnalysis, userMessage, conversationContext) {
    try {
        const prompt = `
        CONTEXTE DE CONVERSATION:
        ${conversationContext}

        ANALYSE DE L'IMAGE:
        ${imageAnalysis}

        MESSAGE DE L'UTILISATEUR:
        ${userMessage}

        Réponds de manière naturelle en intégrant l'analyse de l'image dans la conversation.
        Sois pertinent avec le contexte et le message de l'utilisateur.
        `;

        const result = await conversationModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('❌ Erreur génération réponse image:', error);
        throw new Error('Erreur lors de la génération de la réponse');
    }
}

async function execute(args, msg, sock) {
    try {
        // Vérifier si le message contient une image
        const imageMessage = msg.message?.imageMessage;
        if (!imageMessage) {
            return "❌ Veuillez envoyer une image avec la commande /vision";
        }

        // Télécharger l'image
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const imageBuffer = Buffer.concat(chunks);

        // Analyser l'image
        const analysis = await analyzeImage(imageBuffer, imageMessage.mimetype);

        // Générer une réponse contextuelle
        const response = await generateImageResponse(
            analysis, 
            "Que penses-tu de cette image ?",
            "L'utilisateur demande une analyse d'image."
        );

        return `📸 Analyse de l'image :\n${response}`;

    } catch (error) {
        console.error('❌ Erreur commande vision:', error);
        return "❌ Une erreur est survenue lors de l'analyse de l'image.";
    }
}

// Fonction utilitaire pour télécharger le contenu (à importer depuis baileys)
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'vision',
    description: 'Analyse une image avec Google Vision',
    execute,
    analyzeImage, // Export pour utilisation dans d'autres modules
    generateImageResponse
};
