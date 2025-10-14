// ./commandes/index.js
const fs = require('fs');
const path = require('path');

const commands = new Map();

// Charger automatiquement tous les fichiers de commandes
function loadCommands() {
    const commandsDir = path.join(__dirname);
    const files = fs.readdirSync(commandsDir).filter(file => 
        file.endsWith('.js') && file !== 'index.js'
    );

    for (const file of files) {
        try {
            const commandModule = require(path.join(commandsDir, file));
            
            // Gestion des fichiers avec commandes multiples
            if (Array.isArray(commandModule)) {
                commandModule.forEach(cmd => {
                    if (cmd.name && cmd.execute) {
                        commands.set(cmd.name, cmd);
                        console.log(`✅ Commande chargée: ${cmd.name}`);
                    }
                });
            } 
            // Gestion des fichiers avec commande unique
            else if (commandModule.name && commandModule.execute) {
                commands.set(commandModule.name, commandModule);
                console.log(`✅ Commande chargée: ${commandModule.name}`);
            }
        } catch (error) {
            console.error(`❌ Erreur chargement commande ${file}:`, error);
        }
    }
}

function getCommand(commandName) {
    return commands.get(commandName.toLowerCase());
}

function getAllCommands() {
    return Array.from(commands.values());
}

// Fonctions utilitaires pour les commandes
async function isUserAdmin(jid, participant, sock) {
    try {
        const metadata = await sock.groupMetadata(jid);
        const admins = metadata.participants.filter(p => p.admin !== null).map(p => p.id);
        return admins.includes(participant);
    } catch (error) {
        console.error('Erreur vérification admin:', error);
        return false;
    }
}

function isBotOwner(sender) {
    const botOwners = process.env.BOT_OWNER
        ? process.env.BOT_OWNER.split(',').map(o => o.trim())
        : [];

    return botOwners.some(owner => {
        const cleanSender = sender.split('@')[0];
        const cleanOwner = owner.split('@')[0];
        return cleanSender === cleanOwner;
    });
}

module.exports = {
    isUserAdmin,
    isBotOwner,
    loadCommands,
    getCommand,
    getAllCommands,
    commands
};