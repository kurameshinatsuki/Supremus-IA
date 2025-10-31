// ./commandes/getid.js
const { isBotOwner } = require('./index');

async function executeGetId(args, msg, sock) {
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!isBotOwner(sender)) {
        return "❌ Commande réservée a John Suprêmus.";
    }

    try {
        let targetJid;
        let targetId;

        // Vérifier s'il y a une mention dans le message
        if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            targetId = targetJid.split('@')[0];
        }
        // Vérifier s'il y a un message répondu
        else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
            targetId = targetJid.split('@')[0];
        }
        // Vérifier s'il y a un argument (numéro de téléphone)
        else if (args.length > 0) {
            let phoneNumber = args[0].replace(/[^0-9]/g, '');
            if (!phoneNumber.startsWith('+')) {
                phoneNumber = '+' + phoneNumber;
            }
            targetJid = `${phoneNumber}@s.whatsapp.net`;
            targetId = phoneNumber;
        }
        // Sinon, utiliser l'expéditeur du message
        else {
            targetJid = sender;
            targetId = sender.split('@')[0];
        }

        return `📋 Informations de l'utilisateur :\n\n` +
               `🔹 **JID complet :** \`${targetJid}\`\n` +
               `🔸 **ID utilisateur :** \`${targetId}\`\n` +
               `📱 **Format standard :** \`${targetId.replace('+', '')}@s.whatsapp.net\``;

    } catch (error) {
        console.error('❌ Erreur récupération ID:', error);
        return "❌ Erreur lors de la récupération des informations.";
    }
}

module.exports = [
    {
        name: 'getid',
        description: 'Affiche le JID et ID d\'un utilisateur (mention, réponse ou argument)',
        execute: executeGetId
    }
];