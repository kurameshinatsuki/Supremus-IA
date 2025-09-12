// ocr.js - Module OCR optimisé pour les images de jeux
const Tesseract = require('tesseract.js');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Dossier temporaire pour le stockage des images
const TEMP_DIR = path.join(__dirname, 'temp');

/**
 * Nettoie le texte extrait par OCR
 */
function cleanOCRText(text) {
    if (!text) return '';
    
    // Supprimer les caractères isolés et lignes trop courtes
    const lines = text.split('\n')
        .filter(line => line.trim().length > 2)
        .filter(line => !/^[^a-zA-Z0-9]*$/.test(line))
        .map(line => line.replace(/[^\w\s@\-:()\d%\.]/g, ''))
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(line => line.length > 0);
    
    return lines.join('\n');
}

/**
 * Calcule la qualité estimée de l'OCR
 */
function calculateOCRQuality(text) {
    if (!text) return 0;
    
    const totalChars = text.length;
    const validChars = text.replace(/[^a-zA-Z0-9\sàâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g, '').length;
    const quality = Math.round((validChars / totalChars) * 10);
    
    return Math.min(quality, 10);
}

/**
 * Extrait le texte d'une image en utilisant Tesseract OCR
 */
async function extractTextFromImage(buffer) {
    try {
        console.log('🔍 Début de l\'extraction OCR...');
        
        const { data: { text } } = await Tesseract.recognize(
            buffer,
            'fra+eng',
            { 
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR Progress: ${m.progress * 100}%`);
                    }
                }
            }
        );
        
        console.log('✅ Extraction OCR terminée');
        return cleanOCRText(text.trim());
    } catch (error) {
        console.error('❌ Erreur OCR:', error);
        return null;
    }
}

/**
 * Traitement spécial pour les images de jeu
 */
async function processGameImage(buffer) {
    try {
        console.log('🎮 Traitement spécial pour image de jeu...');
        
        const processedImage = await sharp(buffer)
            .grayscale()
            .modulate({ brightness: 1.2, contrast: 1.3 })
            .normalize({ upper: 98 })
            .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.5 })
            .threshold(150, { grayscale: true })
            .toBuffer();
            
        return await extractTextFromImage(processedImage);
    } catch (error) {
        console.error('❌ Erreur traitement image jeu:', error);
        return null;
    }
}

/**
 * Détection des images de type jeu
 */
async function detectGameTheme(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        
        if (metadata.width && metadata.height) {
            const aspectRatio = metadata.width / metadata.height;
            const isCardLike = (aspectRatio >= 0.6 && aspectRatio <= 0.7);
            const isScreenLike = (aspectRatio >= 1.3 && aspectRatio <= 1.8);
            const isLargeImage = metadata.width > 500 && metadata.height > 300;
            
            return isCardLike || isScreenLike || isLargeImage;
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Traite un message contenant une image et en extrait le texte
 */
async function processImageMessage(msg, sock) {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR);
    }
    
    try {
        const messageType = Object.keys(msg.message)[0];
        const mediaMessage = msg.message[messageType];
        
        console.log('📥 Téléchargement de l\'image...');
        
        const stream = await downloadContentFromMessage(mediaMessage, 'image');
        let buffer = Buffer.from([]);
        
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        const isGameImage = await detectGameTheme(buffer);
        const extractedText = isGameImage 
            ? await processGameImage(buffer) 
            : await extractTextFromImage(buffer);
        
        return extractedText;
    } catch (error) {
        console.error('❌ Erreur traitement image:', error);
        return null;
    }
}

/**
 * Traite un message document et en extrait le texte
 */
async function processDocumentMessage(msg, sock) {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR);
    }
    
    try {
        const messageType = Object.keys(msg.message)[0];
        const mediaMessage = msg.message[messageType];
        
        if (!mediaMessage.mimetype || !mediaMessage.mimetype.includes('image')) {
            console.log('📄 Document non-image ignoré');
            return null;
        }
        
        console.log('📥 Téléchargement du document image...');
        
        const stream = await downloadContentFromMessage(mediaMessage, 'document');
        let buffer = Buffer.from([]);
        
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        const processedImage = await sharp(buffer)
            .grayscale()
            .normalize()
            .sharpen()
            .toBuffer();
            
        return await extractTextFromImage(processedImage);
    } catch (error) {
        console.error('❌ Erreur traitement document:', error);
        return null;
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
                    const stats = fs.statSync(filePath);
                    const age = Date.now() - stats.mtimeMs;
                    
                    if (age > 3600000) {
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

// Nettoyage automatique
cleanupTempFiles();
setInterval(cleanupTempFiles, 3600000);

module.exports = {
    extractTextFromImage,
    processImageMessage,
    processDocumentMessage,
    cleanupTempFiles,
    calculateOCRQuality
};
