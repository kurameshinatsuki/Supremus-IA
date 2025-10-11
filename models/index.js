// models/index.js
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Configuration de la base de données
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  dialectOptions: {
    ssl: process.env.DB_SSL === 'true' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
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
    allowNull: true
  },
  number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  memory: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  // Désactiver les timestamps automatiques si non nécessaires
  timestamps: false
});

// Modèle Group
const Group = sequelize.define('Group', {
  jid: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  memory: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  timestamps: false
});

// Modèle Conversation (optionnel, si vous voulez garder cette table)
const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  jid: {
    type: DataTypes.STRING,
    allowNull: false
  },
  isGroup: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  messages: {
    type: DataTypes.JSONB,
    defaultValue: []
  }
}, {
  timestamps: false
});

// Relations (optionnelles)
User.hasMany(Conversation, { foreignKey: 'jid', sourceKey: 'jid' });
Group.hasMany(Conversation, { foreignKey: 'jid', sourceKey: 'jid' });

// Fonction de synchronisation sécurisée
async function syncDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion à PostgreSQL établie avec succès.');
    
    // Utiliser sync avec { force: false } pour éviter de recréer les tables
    // ou { alter: false } pour désalterer les modifications de schéma automatiques
    await sequelize.sync({ force: false, alter: false });
    console.log('✅ Modèles synchronisés avec la base de données.');
  } catch (error) {
    console.error('❌ Erreur de connexion à la base de données:', error);
    
    // En cas d'erreur, on continue quand même sans synchro forcée
    console.log('⚠️  Continuation avec les tables existantes...');
  }
}

module.exports = {
  sequelize,
  User,
  Group,
  Conversation,
  syncDatabase
};