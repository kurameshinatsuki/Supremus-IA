// memoryManager.js - Bridge entre l'ancien JSON et la nouvelle DB
const fs = require('fs');
const path = require('path');
const { getUser, saveUser, addConversation, initDatabase } = require('./database');

const memoryPath = path.join(__dirname, 'nazuna_memory.json');
let useDatabase = false;
let fallbackMemory = {};

// Initialisation intelligente
async function initMemory() {
    try {
        useDatabase = await initDatabase();
        console.log(useDatabase ? '✅ Mode Database' : '🔄 Mode JSON fallback');
        
        // Charger le JSON en fallback
        if (!useDatabase && fs.existsSync(memoryPath)) {
            fallbackMemory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        }
        
        return true;
    } catch (error) {
        console.error('❌ Erreur init memory:', error);
        return false;
    }
}

// Fonctions universelles (marchent avec DB ou JSON)
async function getMemory(jid) {
    if (useDatabase) {
        return await getUser(jid);
    }
    return fallbackMemory[jid] || { conversations: [] };
}

async function saveMemory(jid, userData) {
    if (useDatabase) {
        return await saveUser(jid, userData);
    } else {
        fallbackMemory[jid] = userData;
        // Sauvegarde asynchrone pour ne pas bloquer
        setTimeout(() => {
            fs.writeFileSync(memoryPath, JSON.stringify(fallbackMemory, null, 2));
        }, 100);
        return userData;
    }
}

async function addMessageToMemory(jid, message, isBot = false) {
    const user = await getMemory(jid) || { conversations: [] };
    
    const newMessage = {
        text: message,
        timestamp: Date.now(),
        fromBot: isBot
    };
    
    // Garder seulement les 20 derniers messages
    const updatedConversations = [
        ...(user.conversations || []).slice(-19),
        newMessage
    ];
    
    const updatedUser = {
        name: user.name,
        conversations: updatedConversations
    };
    
    return await saveMemory(jid, updatedUser);
}

// Migration automatique depuis JSON vers DB
async function migrateToDatabase() {
    if (!useDatabase || !fs.existsSync(memoryPath)) return;
    
    try {
        const jsonData = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        const users = Object.entries(jsonData);
        
        console.log(`🔄 Migration de ${users.length} utilisateurs vers la DB...`);
        
        for (const [jid, userData] of users) {
            await saveUser(jid, userData);
        }
        
        console.log('✅ Migration terminée !');
        
    } catch (error) {
        console.error('❌ Erreur migration:', error);
    }
}

module.exports = {
    initMemory,
    getMemory,
    saveMemory,
    addMessageToMemory,
    migrateToDatabase
};