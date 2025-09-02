// nazunaAI.js - Version corrigée
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const trainingPath = path.join(__dirname, 'Training IA.json');

let trainingData = null;
let lastModified = null;

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

function loadUserMemory() {
    try {
        const memoryPath = path.join(__dirname, 'nazuna_memory.json');
        if (fs.existsSync(memoryPath)) {
            return JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        }
    } catch (error) {
        console.error('Erreur lecture mémoire:', error);
    }
    return { users: {}, groups: {} };
}

function saveUserMemory(memory) {
    try {
        const memoryPath = path.join(__dirname, 'nazuna_memory.json');
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch (error) {
        console.error('Erreur sauvegarde mémoire:', error);
    }
}

async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false, quotedMessage = null) {
    try {
        const memory = loadUserMemory();
        const training = loadTrainingData();

        // Normaliser l'ID de l'expéditeur pour les LIDs
        const normalizedSender = sender.endsWith('@lid') ? sender : sender.split('@')[0] + '@lid';

        // Utiliser le pushName si disponible, sinon utiliser l'ID
        const userName = pushName || memory.users[normalizedSender]?.name || normalizedSender.split('@')[0];

        // Mettre à jour le nom utilisateur
        if (!memory.users[normalizedSender]) {
            memory.users[normalizedSender] = { name: userName, conversations: [] };
        } else if (pushName && memory.users[normalizedSender].name !== pushName) {
            memory.users[normalizedSender].name = pushName;
        }

        let conversationContext = "";

        // Gestion des conversations de groupe
        if (isGroup) {
            if (!memory.groups[remoteJid]) {
                memory.groups[remoteJid] = { participants: {}, lastMessages: [] };
            }

            // Mettre à jour les participants
            if (pushName) {
                memory.groups[remoteJid].participants[normalizedSender] = pushName;
            }

            // Garder les 10 derniers messages du groupe
            memory.groups[remoteJid].lastMessages.push({
                sender: normalizedSender,
                name: userName,
                text: userText,
                timestamp: Date.now()
            });

            if (memory.groups[remoteJid].lastMessages.length > 10) {
                memory.groups[remoteJid].lastMessages = memory.groups[remoteJid].lastMessages.slice(-10);
            }

            // Construire le contexte de groupe
            conversationContext = "Conversation de groupe:\n" +
                memory.groups[remoteJid].lastMessages
                    .map(m => `${m.name}: ${m.text}`)
                    .join('\n') + '\n\n';
        } else {
            // Conversation privée
            if (memory.users[normalizedSender].conversations && memory.users[normalizedSender].conversations.length > 0) {
                conversationContext = "Historique de notre conversation:\n" +
                    memory.users[normalizedSender].conversations
                        .slice(-5)
                        .map(c => `${c.fromUser ? userName : 'Supremia'}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        // Ajouter le message cité au contexte si disponible
        if (quotedMessage) {
            const quotedSender = quotedMessage.sender;
            const quotedName = memory.users[quotedSender]?.name || quotedSender.split('@')[0];
            conversationContext += `Message cité de ${quotedName}: "${quotedMessage.text}"\n`;
        }

        // Construire le prompt final
        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\nSupremia:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Ajouter le message de l'utilisateur à l'historique
        memory.users[normalizedSender].conversations.push({
            text: userText,
            timestamp: Date.now(),
            fromUser: true
        });

        // Ajouter la réponse du bot à l'historique
        memory.users[normalizedSender].conversations.push({
            text: text,
            timestamp: Date.now(),
            fromBot: true
        });

        // Garder seulement les 10 derniers messages
        if (memory.users[normalizedSender].conversations.length > 10) {
            memory.users[normalizedSender].conversations = memory.users[normalizedSender].conversations.slice(-10);
        }

        // Sauvegarder la mémoire
        saveUserMemory(memory);

        // Analyser la réponse pour détecter des mentions
        const mentions = [];
        const mentionRegex = /@(\d+)/g;
        let match;
        while ((match = mentionRegex.exec(text)) !== null) {
            mentions.push(match[1] + '@lid');
        }

        return { text: text, mentions: mentions };
    } catch (e) {
        console.error("[NazunaAI] Erreur:", e.message);
        return { text: "Désolé, je rencontre un problème technique. Veuillez réessayer.", mentions: [] };
    }
}

module.exports = { nazunaReply };