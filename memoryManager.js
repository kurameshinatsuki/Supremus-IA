// memoryManager.js - Bridge optimisé 
const fs = require('fs');
const path = require('path');
const { 
    ensureTablesExist, 
    getUser, 
    saveUser, 
    addConversation 
} = require('./database');

const memoryPath = path.join(__dirname, 'nazuna_memory.json');
let useDatabase = false;
let fallbackMemory = {};

// Initialisation intelligente
async function initMemory() {
    try {
        // Essayer PostgreSQL d'abord
        if (process.env.DATABASE_URL) {
            await ensureTablesExist();
            useDatabase = true;
            console.log('✅ Mode PostgreSQL (Neon)');
        } else {
            // Fallback JSON
            useDatabase = false;
            if (fs.existsSync(memoryPath)) {
                fallbackMemory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
            }
            console.log('🔄 Mode JSON fallback');
        }
        
        return true;
    } catch (error) {
        console.error('❌ Erreur init memory - Fallback JSON:', error);
        useDatabase = false;
        return false;
    }
}

// Fonctions universelles
async function getMemory(jid) {
    if (useDatabase) {
        const user = await getUser(jid);
        return user || { conversations: [] };
    }
    return fallbackMemory[jid] || { conversations: [] };
}

async function saveMemory(jid, userData) {
    if (useDatabase) {
        return await saveUser(jid, userData);
    } else {
        fallbackMemory[jid] = userData;
        // Sauvegarde asynchrone
        setTimeout(() => {
            fs.writeFileSync(memoryPath, JSON.stringify(fallbackMemory, null, 2));
        }, 100);
        return userData;
    }
}

async function addMessageToMemory(jid, message, isBot = false) {
    if (useDatabase) {
        return await addConversation(jid, message, isBot);
    } else {
        const user = await getMemory(jid) || { conversations: [] };
        
        const newMessage = {
            text: message,
            timestamp: Date.now(),
            fromBot: isBot
        };
        
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
}

// Migration automatique JSON → PostgreSQL
async function migrateToDatabase() {
    if (!useDatabase || !fs.existsSync(memoryPath)) return;
    
    try {
        const jsonData = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        const users = Object.entries(jsonData);
        
        console.log(`🔄 Migration de ${users.length} utilisateurs vers PostgreSQL...`);
        
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