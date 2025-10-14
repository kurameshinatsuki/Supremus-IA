// ./commandes/gestion.js
const { isUserAdmin, isBotOwner } = require('./index');
const { resetConversationMemory } = require('../nazunaAI');

// Commande reset
async function executeReset(args, msg, sock) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');

    try {
        if (isGroup) {
            const isAdmin = await isUserAdmin(jid, sender, sock);
            if (!isAdmin) {
                return "❌ Seuls les administrateurs peuvent utiliser cette commande.";
            }
        }

        // Réinitialiser le cache des messages du bot
        const { botMessageCache } = require('../index');
        botMessageCache.delete(jid);

        // Réinitialiser la mémoire dans la base de données
        const success = await resetConversationMemory(isGroup ? jid : sender, isGroup);

        if (success) {
            return "✅ Historique de la conversation réinitialisé avec succès !";
        } else {
            return "❌ Une erreur est survenue lors de la réinitialisation.";
        }

    } catch (error) {
        console.error('❌ Erreur lors de la réinitialisation:', error);
        return "❌ Une erreur est survenue lors de la réinitialisation.";
    }
}

// Commande tagall
async function executeTagall(args, msg, sock) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
        return "❌ Cette commande n'est disponible que dans les groupes.";
    }

    const isAdmin = await isUserAdmin(jid, sender, sock);
    if (!isAdmin) {
        return "❌ Seuls les administrateurs peuvent utiliser cette commande.";
    }

    try {
        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants || [];

        const mentions = [];
        let mentionText = '';

        participants.forEach(p => {
            if (p.id !== sock.user.id) {
                mentions.push(p.id);
                mentionText += `@${String(p.id).split('@')[0]} `;
            }
        });

        await sock.sendMessage(
            jid,
            { text: `📢 Mention de tous les membres :\n${mentionText}`, mentions },
            { quoted: msg }
        );

        return null;
    } catch (error) {
        console.error('❌ Erreur lors du /tagall:', error);
        return "❌ Une erreur est survenue lors de la mention des membres.";
    }
}

// Commande help
async function executeHelp(args, msg, sock) {
    const { getAllCommands } = require('./index');
    const commands = getAllCommands();

    let helpText = "📚 Commandes disponibles :\n";
    commands.forEach(cmd => {
        helpText += `• /${cmd.name} - ${cmd.description}\n`;
    });

    return helpText;
}

module.exports = [
    {
        name: 'reset',
        description: 'Réinitialise l\'historique de la conversation',
        execute: executeReset
    },
    {
        name: 'tagall',
        description: 'Mentionne tous les membres du groupe',
        execute: executeTagall
    },
    {
        name: 'help',
        description: 'Affiche les commandes disponibles',
        execute: executeHelp
    }
];