// auth.js - Gestion de la persistance des sessions
const fs = require('fs');
const path = require('path');

class AuthManager {
    constructor() {
        this.authDir = './auth';
        this.credsFile = './credentials.json';
        this.ensureAuthDir();
    }

    ensureAuthDir() {
        if (!fs.existsSync(this.authDir)) {
            fs.mkdirSync(this.authDir, { recursive: true });
        }
    }

    // Sauvegarder les credentials après pairing
    async saveCredentials(creds) {
        try {
            const credentials = {
                clientID: creds.registered?.clientId,
                serverToken: creds.registered?.serverToken,
                clientToken: creds.registered?.clientToken,
                encKey: creds.registered?.encKey,
                macKey: creds.registered?.macKey,
                me: creds.me,
                noiseKey: creds.noiseKey,
                pairingCode: creds.pairingCode,
                signedIdentityKey: creds.signedIdentityKey,
                signedPreKey: creds.signedPreKey,
                registrationId: creds.registrationId
            };

            fs.writeFileSync(this.credsFile, JSON.stringify(credentials, null, 2));
            console.log('✅ Credentials sauvegardés avec succès');
            return true;
        } catch (error) {
            console.error('❌ Erreur sauvegarde credentials:', error);
            return false;
        }
    }

    // Charger les credentials au démarrage
    async loadCredentials() {
        try {
            if (fs.existsSync(this.credsFile)) {
                const data = fs.readFileSync(this.credsFile, 'utf8');
                const credentials = JSON.parse(data);
                console.log('✅ Credentials chargés depuis le fichier');
                return credentials;
            }
            return null;
        } catch (error) {
            console.error('❌ Erreur chargement credentials:', error);
            return null;
        }
    }

    // Vérifier si une session existe
    hasExistingSession() {
        return fs.existsSync(this.credsFile) || 
               (fs.existsSync(this.authDir) && fs.readdirSync(this.authDir).length > 0);
    }

    // Nettoyer les sessions (en cas de problème)
    async clearSessions() {
        try {
            if (fs.existsSync(this.credsFile)) {
                fs.unlinkSync(this.credsFile);
            }
            if (fs.existsSync(this.authDir)) {
                fs.rmSync(this.authDir, { recursive: true });
            }
            console.log('🧹 Sessions nettoyées');
            return true;
        } catch (error) {
            console.error('❌ Erreur nettoyage sessions:', error);
            return false;
        }
    }
}

module.exports = AuthManager;