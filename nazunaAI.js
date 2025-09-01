// nazunaAI.js - Version corrigée et améliorée
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
            const data = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
            // Vérifier la structure pour la rétrocompatibilité
            if (data.users === undefined) {
                // Ancien format: convertir en nouveau format
                const newData = { users: {}, groups: {} };
                for (const [sender, userData] of Object.entries(data)) {
                    newData.users[sender] = userData;
                }
                return newData;
            }
            return data;
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

async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false) {
    try {
        const memory = loadUserMemory();
        const training = loadTrainingData();

        // Utiliser le pushName si disponible, sinon utiliser l'ID
        const userName = pushName || memory.users[sender]?.name || sender.split('@')[0];
        
        // Mettre à jour le nom si pushName est fourni et différent
        if (pushName && (!memory.users[sender] || memory.users[sender].name !== pushName)) {
            if (!memory.users[sender]) {
                memory.users[sender] = { name: userName, conversations: [] };
            } else {
                memory.users[sender].name = pushName;
            }
            saveUserMemory(memory);
        }
        
        let conversationContext = "";

        // Initialiser la mémoire utilisateur si nécessaire
        if (!memory.users[sender]) {
            memory.users[sender] = { name: userName, conversations: [] };
        }

        // Gestion des conversations de groupe
        if (isGroup) {
            if (!memory.groups[remoteJid]) {
                memory.groups[remoteJid] = { participants: {}, lastMessages: [] };
            }
            
            // Mettre à jour les participants
            if (pushName) {
                memory.groups[remoteJid].participants[sender] = pushName;
            }
            
            // Garder les 10 derniers messages du groupe
            memory.groups[remoteJid].lastMessages.push({
                sender: sender,
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
            if (memory.users[sender].conversations && memory.users[sender].conversations.length > 0) {
                conversationContext = "Historique de notre conversation:\n" +
                    memory.users[sender].conversations
                        .slice(-5)
                        .map(c => `${c.fromUser ? userName : 'Nazuna'}: ${c.text}`)
                        .join('\n') + '\n';
            }
        }

        // Construire le prompt final
        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\nSupremia:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        if (!response || !response.text) {
            throw new Error("Réponse vide de l'API Gemini");
        }
        
        const text = response.text().trim();
        
        if (!text) {
            return { text: "Je n'ai pas bien compris. Pouvez-vous reformuler?" };
        }

        // Ajouter le message de l'utilisateur à l'historique
        memory.users[sender].conversations.push({
            text: userText,
            timestamp: Date.now(),
            fromUser: true
        });

        // Ajouter la réponse du bot à l'historique
        memory.users[sender].conversations.push({
            text: text,
            timestamp: Date.now(),
            fromBot: true
        });

        // Garder seulement les 10 derniers messages
        if (memory.users[sender].conversations.length > 10) {
            memory.users[sender].conversations = memory.users[sender].conversations.slice(-10);
        }

        // Sauvegarder la mémoire
        saveUserMemory(memory);

        return { text: text };
    } catch (e) {
        console.error("[NazunaAI] Erreur détaillée:", e);
        
        // Messages d'erreur plus spécifiques
        if (e.message.includes("API_KEY") || e.message.includes("quota")) {
            return { text: "Service temporairement indisponible. Veuillez réessayer plus tard." };
        } else if (e.message.includes("Réponse vide")) {
            return { text: "Je n'ai pas pu générer de réponse. Pouvez-vous reformuler votre question?" };
        } else {
            return { text: "Désolé, je rencontre un problème technique. Veuillez réessayer." };
        }
    }
}

module.exports = { nazunaReply };