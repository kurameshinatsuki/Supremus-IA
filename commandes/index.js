const fs = require('fs');
const path = require('path');
const { isUserAdmin, isBotOwner } = require('./index');

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
            if (commandModule.name && commandModule.execute) {
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

module.exports = {
    isUserAdmin,
    isBotOwner,
    loadCommands,
    getCommand,
    getAllCommands,
    commands
};
