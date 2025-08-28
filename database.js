// database.js
const { Sequelize, DataTypes } = require('sequelize');

// Configuration de la connexion Neon
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false // Désactive les logs SQL en production
});

// Modèle User
const User = sequelize.define('User', {
  jid: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  conversations: {
    type: DataTypes.JSONB, // Stockage JSON optimisé pour PostgreSQL
    defaultValue: []
  },
  lastInteraction: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true // Ajoute createdAt et updatedAt automatiquement
});

// Modèle Group pour le contexte collectif
const Group = sequelize.define('Group', {
  jid: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  name: DataTypes.STRING,
  participants: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  lastActivity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Initialisation de la base
async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connecté à PostgreSQL (Neon)');
    
    await sequelize.sync({ alter: true }); // Sync les modèles avec la BD
    console.log('✅ Modèles synchronisés');
    
    return true;
  } catch (error) {
    console.error('❌ Erreur connexion PostgreSQL:', error);
    return false;
  }
}

// Fonctions pour gérer les utilisateurs
async function getUser(jid) {
  try {
    const user = await User.findByPk(jid);
    return user ? user.toJSON() : null;
  } catch (error) {
    console.error('Erreur getUser:', error);
    return null;
  }
}

async function saveUser(jid, userData) {
  try {
    const [user, created] = await User.upsert({
      jid,
      name: userData.name,
      conversations: userData.conversations || [],
      lastInteraction: new Date()
    });
    
    return user.toJSON();
  } catch (error) {
    console.error('Erreur saveUser:', error);
    throw error;
  }
}

async function addConversation(jid, message, isBot = false) {
  try {
    const user = await User.findByPk(jid);
    if (!user) return null;

    const newConversation = {
      text: message,
      timestamp: new Date(),
      fromBot: isBot
    };

    // Limite à 50 messages par utilisateur
    const updatedConversations = [
      ...user.conversations.slice(-49),
      newConversation
    ];

    user.conversations = updatedConversations;
    user.lastInteraction = new Date();
    await user.save();

    return user.toJSON();
  } catch (error) {
    console.error('Erreur addConversation:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  User,
  Group,
  initDatabase,
  getUser,
  saveUser,
  addConversation
};