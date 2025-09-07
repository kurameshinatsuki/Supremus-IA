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
  name: DataTypes.STRING,
  number: DataTypes.STRING,
  memory: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
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
});

// Modèle Conversation
const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  jid: DataTypes.STRING,
  isGroup: DataTypes.BOOLEAN,
  messages: {
    type: DataTypes.JSONB,
    defaultValue: []
  }
});

// Relations
User.hasMany(Conversation, { foreignKey: 'jid', sourceKey: 'jid' });
Group.hasMany(Conversation, { foreignKey: 'jid', sourceKey: 'jid' });

// Synchronisation des modèles
async function syncDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion à PostgreSQL établie avec succès.');
    
    await sequelize.sync({ alter: true });
    console.log('✅ Modèles synchronisés avec la base de données.');
  } catch (error) {
    console.error('❌ Erreur de connexion à la base de données:', error);
  }
}

module.exports = {
  sequelize,
  User,
  Group,
  Conversation,
  syncDatabase
};