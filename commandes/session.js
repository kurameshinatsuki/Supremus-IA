// ./commandes/session.js
const { isBotOwner } = require('../index');

async function executeDecodeSession(args, msg, sock) {
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!isBotOwner(sender)) {
        return "❌ Commande réservée a John Suprêmus.";
    }

    if (args.length === 0) {
        return "❌ Usage: /decode <session_base64>";
    }

    try {
        const sessionBase64 = args.join(' ');
        const sessionData = JSON.parse(Buffer.from(sessionBase64, 'base64').toString());
        
        return `✅ Session décodée :\n\`\`\`json\n${JSON.stringify(sessionData, null, 2)}\n\`\`\``;
        
    } catch (error) {
        console.error('❌ Erreur décodage session:', error);
        return "❌ Session Base64 invalide.";
    }
}

module.exports = [
    {
        name: 'decode',
        description: 'Décode une session John Suprêmus',
        execute: executeDecodeSession
    }
];