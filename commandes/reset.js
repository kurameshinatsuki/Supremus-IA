const { resetConversationMemory } = require('../nazunaAI');

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

async function execute(args, msg, sock) {
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

module.exports = {
    name: 'reset',
    description: 'Réinitialise l\'historique de la conversation',
    execute
};
