// auth-sequelize.js - VERSION SÉCURISÉE
const { WhatsAppAuth } = require('./models');

class SequelizeAuthState {
    constructor() {
        this.creds = this.getEmptyCreds();
        this.keys = {};
    }

    getEmptyCreds() {
        return {
            noiseKey: null,
            pairingEphemeralKeyPair: null,
            signedIdentityKey: null,
            signedPreKey: null,
            registrationId: null,
            advSecretKey: null,
            processedHistoryMessages: [],
            nextPreKeyId: null,
            firstUnuploadedPreKeyId: null,
            accountSyncCounter: 1,
            accountSettings: { unarchiveChats: false },
            registered: false,
            me: null,
            signalIdentities: [],
            platform: null,
            routingInfo: null,
            lastAccountSyncTimestamp: null,
            lastPropHash: null,
            myAppStateKeyId: null
        };
    }

    areCredsValid(creds) {
        return creds && 
               creds.noiseKey && 
               creds.signedIdentityKey && 
               creds.signedPreKey;
    }

    async init() {
        try {
            await WhatsAppAuth.findOne({ where: { key: 'creds' } });
        } catch (error) {
            // Ignorer les erreurs de table
        }
    }

    async saveCreds() {
        try {
            // Ne sauvegarder que si les credentials sont valides
            if (this.areCredsValid(this.creds)) {
                await WhatsAppAuth.upsert({
                    key: 'creds',
                    value: this.creds
                });
                console.log('✅ Credentials valides sauvegardés');
            } else {
                console.log('⚠️  Credentials incomplets - non sauvegardés');
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde:', error);
        }
    }

    async saveKey(keyId, keyData) {
        try {
            await WhatsAppAuth.upsert({
                key: keyId,
                value: keyData
            });
        } catch (error) {
            console.error('❌ Erreur sauvegarde clé:', error);
        }
    }

    async removeKey(keyId) {
        try {
            await WhatsAppAuth.destroy({ where: { key: keyId } });
        } catch (error) {
            console.error('❌ Erreur suppression clé:', error);
        }
    }

    async loadAllKeys() {
        try {
            const results = await WhatsAppAuth.findAll();
            
            // TOUJOURS réinitialiser au démarrage
            this.creds = this.getEmptyCreds();
            this.keys = {};
            
            for (const row of results) {
                if (row.key === 'creds' && this.areCredsValid(row.value)) {
                    console.log('✅ Chargement de credentials valides');
                    this.creds = row.value;
                } else if (row.key === 'creds') {
                    console.log('🚨 Credentials incomplets détectés - utilisation de valeurs vides');
                    this.creds = this.getEmptyCreds();
                } else if (row.value) {
                    this.keys[row.key] = row.value;
                }
            }
            
        } catch (error) {
            console.error('❌ Erreur chargement auth state:', error);
            this.creds = this.getEmptyCreds();
            this.keys = {};
        }
    }

    async clear() {
        try {
            await WhatsAppAuth.destroy({ where: {} });
            this.creds = this.getEmptyCreds();
            this.keys = {};
            console.log('✅ Table complètement vidée');
        } catch (error) {
            console.error('❌ Erreur nettoyage:', error);
        }
    }
}

module.exports = { SequelizeAuthState };
