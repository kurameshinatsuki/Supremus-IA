// nazunaAI.js - Version mise à jour
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
                // Ancien format, convertir en nouveau format
                data.users = data;
                data.groups = {};
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

async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false, quotedMessage = null) {
    try {
        const memory = loadUserMemory();
        const training = loadTrainingData();

        // Utiliser le pushName si disponible, sinon utiliser l'ID
        const userName = pushName || memory.users[sender]?.name || sender.split('@')[0];
        
        // Mettre à jour le nom utilisateur
        if (!memory.users[sender]) {
            memory.users[sender] = { name: userName, conversations: [] };
        } else if (pushName && memory.users[sender].name !== pushName) {
            memory.users[sender].name = pushName;
        }

        let conversationContext = "";
        let mentionedJids = []; // Pour stocker les JID à mentionner

        // Gestion des conversations de groupe
        if (isGroup) {
            if (!memory.groups[remoteJid]) {
                memory.groups[remoteJid] = { participants: {}, lastMessages: [] };
            }
            
            // Mettre à jour les participants
            if (pushName) {
                memory.groups[remoteJid].participants[sender] = pushName;
            }
            
            // Ajouter le message actuel à l'historique du groupe
            memory.groups[remoteJid].lastMessages.push({
                sender: sender,
                name: userName,
                text: userText,
                timestamp: Date.now()
            });
            
            // Garder les 10 derniers messages du groupe
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

        // Si un message est cité, l'ajouter au contexte
        if (quotedMessage) {
            const quotedSender = quotedMessage.sender;
            const quotedName = memory.users[quotedSender]?.name || memory.groups[remoteJid]?.participants[quotedSender] || quotedSender.split('@')[0];
            conversationContext += `Message cité de ${quotedName}: ${quotedMessage.text}\n`;
        }

        // Construire le prompt final
        const prompt = `${training}\n\n${conversationContext}\n${userName}: ${userText}\nNazuna:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Ajouter le message de l'utilisateur à l'historique
        if (isGroup) {
            // Dans un groupe, on a déjà ajouté le message à l'historique du groupe
        } else {
            memory.users[sender].conversations.push({
                text: userText,
                timestamp: Date.now(),
                fromUser: true
            });
        }

        // Ajouter la réponse du bot à l'historique
        if (isGroup) {
            // Pour les groupes, on n'ajoute pas la réponse de l'IA à l'historique des messages du groupe pour éviter de s'auto-référencer
        } else {
            memory.users[sender].conversations.push({
                text: text,
                timestamp: Date.now(),
                fromBot: true
            });
        }

        // Garder seulement les 10 derniers messages pour les conversations privées
        if (memory.users[sender].conversations.length > 10) {
            memory.users[sender].conversations = memory.users[sender].conversations.slice(-10);
        }

        // Sauvegarder la mémoire
        saveUserMemory(memory);

        // Analyser la réponse pour détecter des mentions
        // Exemple: si la réponse contient "@Alice", on va chercher le JID d'Alice dans les participants
        if (isGroup) {
            const mentionRegex = /@(\w+)/g;
            let match;
            while ((match = mentionRegex.exec(text)) !== null) {
                const nameToMention = match[1];
                // Chercher dans les participants du groupe
                for (const [jid, name] of Object.entries(memory.groups[remoteJid].participants)) {
                    if (name === nameToMention) {
                        mentionedJids.push(jid);
                        break;
                    }
                }
            }
        }

        return {
            text: text || "Désolé, je n'ai pas pu générer de réponse. Pouvez-vous reformuler?",
            mentions: mentionedJids
        };
    } catch (e) {
        console.error("[NazunaAI] Erreur:", e.message);
        return {
            text: "Désolé, je rencontre un problème technique. Veuillez réessayer.",
            mentions: []
        };
    }
}

module.exports = { nazunaReply };