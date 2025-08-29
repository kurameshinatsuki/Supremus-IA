// database.js - Version robuste avec ton code éprouvé
require("dotenv").config();
const { Pool } = require("pg");

// Configuration de la connexion
const dbUrl = process.env.DATABASE_URL || "postgresql://rc_db_pblv_user:kxZvnDTYaPYTScD70HBov7Wgr0nboPL7@dpg-d2o2cnfdiees73evq170-a.oregon-postgres.render.com/rc_db_pblv";
const proConfig = {
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 20, // Nombre max de connexions
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

const pool = new Pool(proConfig);

// Flag pour ne vérifier les tables qu'une seule fois
let tablesVerified = false;

// Fonction pour créer les tables si elles n'existent pas
async function ensureTablesExist() {
    if (tablesVerified) return;
    
    const client = await pool.connect();
    try {
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
        console.log("✅ Tables vérifiées/créées.");
    } catch (error) {
        console.error("❌ Erreur création tables:", error);
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
        console.error(`❌ Erreur récupération utilisateur ${jid}:`, error);
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
        console.error(`❌ Erreur sauvegarde utilisateur ${jid}:`, error);
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
        
        // CONVERTIR les conversations de string JSON → array
        const currentConversations = user?.conversations 
            ? (typeof user.conversations === 'string' 
                ? JSON.parse(user.conversations) 
                : user.conversations)
            : [];


// Nettoyer les anciennes conversations (maintenance)
async function cleanupOldConversations(daysToKeep = 30) {
    const client = await pool.connect();
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        await client.query(
            `DELETE FROM users WHERE last_interaction < $1`,
            [cutoffDate]
        );

        console.log(`🧹 Nettoyage des données vieilles de ${daysToKeep} jours`);
    } catch (error) {
        console.error("❌ Erreur nettoyage:", error);
    } finally {
        client.release();
    }
}

// Fermer proprement le pool
async function closePool() {
    try {
        await pool.end();
        console.log("✅ Pool PostgreSQL fermé");
    } catch (error) {
        console.error("❌ Erreur fermeture pool:", error);
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
    closePool
};