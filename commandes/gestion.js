// ./commandes/gestion.js
const { isUserAdmin, isBotOwner } = require('./index');
const { resetConversationMemory } = require('../nazunaAI');

// Commande reset
async function executeReset(args, msg, sock) {
    let targetJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const isGroup = targetJid.endsWith('@g.us');

    try {
        // Vérifier si un JID est fourni en argument
        if (args.length > 0) {
            const jidArg = args[0].trim();

            // Validation basique du JID
            if (!jidArg.includes('@') || (!jidArg.endsWith('@s.whatsapp.net') && !jidArg.endsWith('@g.us'))) {
                return "❌ Format de JID invalide. Utilisez: !reset [jid] ou !reset pour la conversation actuelle.";
            }

            targetJid = jidArg;
        }

        // Vérifications de sécurité et permissions
        const isOwner = await isBotOwner(sender);
        
        if (targetJid.endsWith('@g.us')) {
            // Pour les groupes
            if (!isOwner) {
                const isAdmin = await isUserAdmin(targetJid, sender, sock);
                if (!isAdmin) {
                    return "❌ Seuls les administrateurs peuvent réinitialiser les conversations de groupe.";
                }
            }
        } else {
            // Pour les conversations privées
            if (targetJid !== sender && !isOwner) {
                return "❌ Vous ne pouvez réinitialiser que votre propre conversation ou des groupes où vous êtes administrateur.";
            }
        }

        // Réinitialiser le cache des messages du bot
        const { botMessageCache } = require('../index');
        botMessageCache.delete(targetJid);

        // Réinitialiser la mémoire dans la base de données
        const targetIsGroup = targetJid.endsWith('@g.us');
        const success = await resetConversationMemory(targetJid, targetIsGroup);

        if (success) {
            if (targetJid === msg.key.remoteJid) {
                return "✅ Historique de la conversation réinitialisé avec succès !";
            } else {
                return `✅ Historique de la conversation ${targetJid} réinitialisé avec succès !`;
            }
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

    const isOwner = await isBotOwner(sender);
    if (!isOwner) {
        const isAdmin = await isUserAdmin(jid, sender, sock);
        if (!isAdmin) {
            return "❌ Seuls les administrateurs peuvent utiliser cette commande.";
        }
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

// Commande hidetag
async function executeHidetag(args, msg, sock) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
        return "❌ Cette commande n'est disponible que dans les groupes.";
    }

    const isOwner = await isBotOwner(sender);
    if (!isOwner) {
        const isAdmin = await isUserAdmin(jid, sender, sock);
        if (!isAdmin) {
            return "❌ Seuls les administrateurs peuvent utiliser cette commande.";
        }
    }

    try {
        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants || [];

        const mentions = [];
        participants.forEach(p => {
            if (p.id !== sock.user.id) {
                mentions.push(p.id);
            }
        });

        const message = args.length > 0 ? args.join(' ') : '📢 Notification silencieuse';
        
        await sock.sendMessage(
            jid,
            { 
                text: message, 
                mentions,
                contextInfo: {
                    mentionedJid: mentions
                }
            },
            { quoted: msg }
        );

        return null;
    } catch (error) {
        console.error('❌ Erreur lors du /hidetag:', error);
        return "❌ Une erreur est survenue lors de la mention silencieuse.";
    }
}

// Commande tag
async function executeTag(args, msg, sock) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
        return "❌ Cette commande n'est disponible que dans les groupes.";
    }

    const isOwner = await isBotOwner(sender);
    if (!isOwner) {
        const isAdmin = await isUserAdmin(jid, sender, sock);
        if (!isAdmin) {
            return "❌ Seuls les administrateurs peuvent utiliser cette commande.";
        }
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

        const customMessage = args.length > 0 ? args.join(' ') : '📢 Mention de tous les membres';
        
        await sock.sendMessage(
            jid,
            { 
                text: `${customMessage}\n${mentionText}`, 
                mentions 
            },
            { quoted: msg }
        );

        return null;
    } catch (error) {
        console.error('❌ Erreur lors du /tag:', error);
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
        description: 'Mentionne tous les membres du groupe avec liste visible',
        execute: executeTagall
    },
    {
        name: 'hidetag',
        description: 'Mentionne tous les membres sans afficher la liste (tag silencieux)',
        execute: executeHidetag
    },
    {
        name: 'tag',
        description: 'Mentionne tous les membres avec un message personnalisé',
        execute: executeTag
    },
    {
        name: 'help',
        description: 'Affiche les commandes disponibles',
        execute: executeHelp
    }
];