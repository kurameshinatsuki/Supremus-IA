// auth-sequelize.js
const { WhatsAppAuth } = require('./models');

class SequelizeAuthState {
    constructor() {
        this.creds = {};
        this.keys = {};
    }

    async init() {
        try {
            // Vérifier que la table existe en essayant une requête simple
            await WhatsAppAuth.findOne({ where: { key: 'creds' } });
            console.log('✅ Auth state initialisé avec Sequelize');
        } catch (error) {
            console.error('❌ Erreur initialisation auth Sequelize:', error);
            throw error;
        }
    }

    async saveCreds() {
        try {
            await WhatsAppAuth.upsert({
                key: 'creds',
                value: this.creds
            });
            console.log('✅ Credentials sauvegardés dans PostgreSQL via Sequelize');
        } catch (error) {
            console.error('❌ Erreur sauvegarde credentials:', error);
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
            for (const row of results) {
                if (row.key === 'creds') {
                    this.creds = row.value;
                } else {
                    this.keys[row.key] = row.value;
                }
            }
            console.log('✅ Auth state chargé depuis PostgreSQL via Sequelize');
        } catch (error) {
            console.error('❌ Erreur chargement auth state:', error);
        }
    }

    async clear() {
        try {
            await WhatsAppAuth.destroy({ where: {} });
            this.creds = {};
            this.keys = {};
            console.log('✅ Auth state nettoyé');
        } catch (error) {
            console.error('❌ Erreur nettoyage auth state:', error);
        }
    }
}

module.exports = { SequelizeAuthState };
