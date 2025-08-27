# Utiliser l'image officielle Node.js
FROM node:18

# Définir le dossier de travail dans le conteneur
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances de production
RUN npm install --production

# Copier tout le reste du code
COPY . .

# Lancer le bot
CMD ["npm", "start"]