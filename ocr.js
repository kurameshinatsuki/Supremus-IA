// ocr.js - Module OCR pour Tesseract.js
const Tesseract = require('tesseract.js');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Dossier temporaire pour le stockage des images (sera créé automatiquement)
const TEMP_DIR = path.join(__dirname, 'temp');

/**
 * Extrait le texte d'une image en utilisant Tesseract OCR
 */
async function extractTextFromImage(buffer) {
    try {
        console.log('🔍 Début de l\'extraction OCR...');
        
        const { data: { text } } = await Tesseract.recognize(
            buffer,
            'fra+eng', // Langues: français + anglais
            { 
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR Progress: ${m.progress * 100}%`);
                    }
                }
            }
        );
        
        console.log('✅ Extraction OCR terminée');
        return text.trim();
    } catch (error) {
        console.error('❌ Erreur OCR:', error);
        return null;
    }
}

/**
 * Traitement spécial pour les images de jeu (comme Origamy World)
 */
async function processGameImage(buffer) {
    try {
        console.log('🎮 Traitement spécial pour image de jeu...');
        
        // Traitement spécifique pour les images de jeu avec texte clair sur fond sombre
        const processedImage = await sharp(buffer)
            .grayscale()
            .normalize({ upper: 95 }) // Ajustement du contraste pour texte blanc
            .sharpen({ sigma: 1.2 })
            .threshold(128) // Binarisation pour améliorer la reconnaissance
            .toBuffer();
            
        const extractedText = await extractTextFromImage(processedImage);
        return extractedText;
    } catch (error) {
        console.error('❌ Erreur traitement image jeu:', error);
        return null;
    }
}

/**
 * Traite un message contenant une image et en extrait le texte
 */
async function processImageMessage(msg, sock) {
    // Créer le dossier temp s'il n'existe pas
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR);
    }
    
    let tempFilePath = null;
    
    try {
        const messageType = Object.keys(msg.message)[0];
        const mediaMessage = msg.message[messageType];
        
        console.log('📥 Téléchargement de l\'image...');
        
        // Télécharger l'image
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let buffer = Buffer.from([]);
        
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        // Détection automatique du type d'image
        const isLikelyGameImage = await detectGameTheme(buffer);
        
        let extractedText;
        if (isLikelyGameImage) {
            console.log('🎮 Image de jeu détectée - application du traitement spécial');
            extractedText = await processGameImage(buffer);
        } else {
            console.log('🖼️ Traitement standard d\'image');
            // Pré-traiter l'image pour améliorer l'OCR
            const processedImage = await sharp(buffer)
                .grayscale() // Convertir en niveaux de gris
                .normalize() // Améliorer le contraste
                .sharpen() // Accentuer les bords
                .toBuffer();
                
            extractedText = await extractTextFromImage(processedImage);
        }
        
        return extractedText;
    } catch (error) {
        console.error('❌ Erreur traitement image:', error);
        
        // Nettoyer en cas d'erreur
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) {
                console.error('Erreur nettoyage fichier temporaire:', e);
            }
        }
        
        return null;
    }
}

/**
 * Traite un message document (qui peut être une image) et en extrait le texte
 */
async function processDocumentMessage(msg, sock) {
    // Créer le dossier temp s'il n'existe pas
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR);
    }
    
    let tempFilePath = null;
    
    try {
        const messageType = Object.keys(msg.message)[0];
        const mediaMessage = msg.message[messageType];
        
        // Vérifier si c'est une image dans un document
        if (!mediaMessage.mimetype || !mediaMessage.mimetype.includes('image')) {
            console.log('📄 Document non-image ignoré');
            return null;
        }
        
        console.log('📥 Téléchargement du document image...');
        
        // Télécharger le document
        const stream = await downloadContentFromMessage(mediaMessage, 'document');
        let buffer = Buffer.from([]);
        
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        // Pré-traiter l'image
        const processedImage = await sharp(buffer)
            .grayscale()
            .normalize()
            .sharpen()
            .toBuffer();
            
        const extractedText = await extractTextFromImage(processedImage);
        
        return extractedText;
    } catch (error) {
        console.error('❌ Erreur traitement document:', error);
        
        // Nettoyer en cas d'erreur
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) {
                console.error('Erreur nettoyage fichier temporaire:', e);
            }
        }
        
        return null;
    }
}

/**
 * Détection simple des images de type jeu (comme Origamy World)
 */
async function detectGameTheme(buffer) {
    try {
        // Analyse des métadonnées pour détecter les caractéristiques des images de jeu
        const metadata = await sharp(buffer).metadata();
        
        // Les images de jeu ont souvent des dimensions spécifiques
        // et une palette de couleurs particulière
        if (metadata.width && metadata.height) {
            // Ratio d'aspect commun pour les images de jeu
            const aspectRatio = metadata.width / metadata.height;
            
            // Beaucoup d'images de jeu ont un ratio autour de 1.77 (16:9) ou 1.33 (4:3)
            if (aspectRatio >= 1.3 && aspectRatio <= 1.8) {
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('❌ Erreur détection thème jeu:', error);
        return false;
    }
}

/**
 * Nettoyage des fichiers temporaires
 */
function cleanupTempFiles() {
    if (fs.existsSync(TEMP_DIR)) {
        try {
            const files = fs.readdirSync(TEMP_DIR);
            let deletedCount = 0;
            
            files.forEach(file => {
                const filePath = path.join(TEMP_DIR, file);
                try {
                    // Supprimer les fichiers de plus de 1 heure
                    const stats = fs.statSync(filePath);
                    const age = Date.now() - stats.mtimeMs;
                    
                    if (age > 3600000) { // 1 heure en millisecondes
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                } catch (e) {
                    console.error('Erreur suppression fichier temporaire:', e);
                }
            });
            
            if (deletedCount > 0) {
                console.log(`🧹 ${deletedCount} fichiers temporaires nettoyés`);
            }
        } catch (error) {
            console.error('❌ Erreur nettoyage fichiers temporaires:', error);
        }
    }
}

// Nettoyage automatique au démarrage
cleanupTempFiles();

// Nettoyage périodique toutes les heures
setInterval(cleanupTempFiles, 3600000); // 1 heure

module.exports = {
    extractTextFromImage,
    processImageMessage,
    processDocumentMessage,
    cleanupTempFiles
};
