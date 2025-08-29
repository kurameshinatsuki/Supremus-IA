// database.js - Version corrigée avec gestion SSL
require("dotenv").config();
const { Pool } = require("pg");

// Configuration de la connexion avec SSL
const dbUrl = process.env.DATABASE_URL || "postgresql://supremia_db_user:YdWoiO3atGkPgfqyfea0YqS7pU2s0sDT@dpg-d2oor1mr433s73b7ls6g-a.oregon-postgres.render.com/supremia_db";

// Configuration pour Render.com et autres services cloud
const proConfig = {
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
};

const pool = new Pool(proConfig);

// Test de connexion au démarrage
pool.on('connect', client => {
    console.log('🔌 Nouvelle connexion DB établie');
});

pool.on('error', err => {
    console.error('❌ Erreur inattendue sur le pool PostgreSQL:', err);
    // Vous pourriez redémarrer l'application ici si nécessaire
});

let tablesVerified = false;

// Fonction pour créer les tables si elles n'existent pas
async function ensureTablesExist() {
    if (tablesVerified) return;

    const client = await pool.connect();
    try {
        console.log('🔍 Vérification des tables...');
        
        // Table users
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                jid VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                conversations JSONB DEFAULT '[]',
                last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Table groups (pour le contexte collectif)
        await client.query(`
            CREATE TABLE IF NOT EXISTS groups (
                jid VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                participants JSONB DEFAULT '[]',
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Index pour optimiser les recherches
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_last_interaction 
            ON users(last_interaction);
        `);

        tablesVerified = true;
        console.log("✅ Tables vérifiées/créées avec succès.");
    } catch (error) {
        console.error("❌ Erreur création tables:", error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Récupérer un utilisateur
async function getUser(jid) {
    const client = await pool.connect();
    try {
        await ensureTablesExist();

        const result = await client.query(
            `SELECT jid, name, conversations, last_interaction 
             FROM users WHERE jid = $1`,
            [jid]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error(`❌ Erreur récupération utilisateur ${jid}:`, error.message);
        return null;
    } finally {
        client.release();
    }
}

// Sauvegarder un utilisateur (upsert)
async function saveUser(jid, userData) {
    if (!jid || !userData) {
        console.warn("❌ Paramètres invalides pour saveUser");
        return null;
    }

    const client = await pool.connect();
    try {
        await ensureTablesExist();

        const query = `
            INSERT INTO users (jid, name, conversations, last_interaction)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (jid)
            DO UPDATE SET 
                name = EXCLUDED.name,
                conversations = EXCLUDED.conversations,
                last_interaction = EXCLUDED.last_interaction,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `;

        const values = [
            jid,
            userData.name || jid.split('@')[0],
            JSON.stringify(userData.conversations || []),
            new Date()
        ];

        const result = await client.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.error(`❌ Erreur sauvegarde utilisateur ${jid}:`, error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Ajouter un message à la conversation
async function addConversation(jid, message, isBot = false) {
    const client = await pool.connect();
    try {
        await ensureTablesExist();

        // Récupérer l'utilisateur existant
        const user = await getUser(jid);
        const currentConversations = user?.conversations || [];

        // Nouveau message
        const newMessage = {
            text: message,
            timestamp: new Date(),
            fromBot: isBot
        };

        // Garder seulement les 50 derniers messages
        const updatedConversations = [
            ...currentConversations.slice(-49),
            newMessage
        ];

        // Mettre à jour l'utilisateur
        const updateQuery = `
            UPDATE users 
            SET conversations = $1, last_interaction = $2
            WHERE jid = $3
            RETURNING *;
        `;

        const result = await client.query(updateQuery, [
            JSON.stringify(updatedConversations),
            new Date(),
            jid
        ]);

        return result.rows[0];
    } catch (error) {
        console.error(`❌ Erreur ajout conversation ${jid}:`, error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Nettoyer les anciennes conversations (maintenance)
async function cleanupOldConversations(daysToKeep = 30) {
    const client = await pool.connect();
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await client.query(
            `DELETE FROM users WHERE last_interaction < $1 RETURNING jid`,
            [cutoffDate]
        );

        console.log(`🧹 Nettoyage de ${result.rowCount} entrées vieilles de ${daysToKeep} jours`);
    } catch (error) {
        console.error("❌ Erreur nettoyage:", error.message);
    } finally {
        client.release();
    }
}

// Test de connexion à la base de données
async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time');
        console.log('✅ Connexion DB réussie:', result.rows[0].current_time);
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Échec connexion DB:', error.message);
        return false;
    }
}

// Fermer proprement le pool
async function closePool() {
    try {
        await pool.end();
        console.log("✅ Pool PostgreSQL fermé");
    } catch (error) {
        console.error("❌ Erreur fermeture pool:", error.message);
    }
}

// Exportations
module.exports = {
    pool,
    ensureTablesExist,
    getUser,
    saveUser,
    addConversation,
    cleanupOldConversations,
    closePool,
    testConnection
};