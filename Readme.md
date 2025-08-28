# 🌸 NazunaBot - WhatsApp AI Bot

&#x20; &#x20;

NazunaBot est un bot WhatsApp intelligent basé sur **Baileys** et **Google Gemini AI**, capable de répondre automatiquement aux messages, de réagir aux mentions, et même d’envoyer des stickers aléatoires 🎴.

---

## 📑 Sommaire

1. [Fonctionnalités](#-fonctionnalités)
2. [Prérequis](#-prérequis)
3. [Installation](#-installation)
4. [Configuration](#-configuration)
5. [Lancement](#-lancement)
6. [Structure du projet](#-structure-du-projet)
7. [Aperçu des logs](#-aperçu-des-logs)
8. [📸 Screenshots & Démo](#-screenshots--démo)
9. [Problèmes fréquents](#-problèmes-fréquents)
10. [Licence](#-licence)

---

## ✨ Fonctionnalités

- 🤖 **Réponses IA** avec l’API **Gemini**
- 🎯 Déclenchement automatique si :
  - Mention `@nazuna`
  - Mention du bot dans un groupe
  - Réponse directe au bot
  - Message en privé (DM)
- 🎴 Envoi de **stickers aléatoires** depuis `./stickers/`
- 📂 Gestion de session sécurisée (via dossier `./session/`)
- 🛠️ Logs détaillés pour chaque message reçu

---

## 📦 Prérequis

- [Node.js](https://nodejs.org/) **v20.x ou supérieur**
- Un compte WhatsApp (numéro valide)
- Une clé API **Google Gemini**

---

## ⚙️ Installation

```bash
# Cloner le projet
git clone https://github.com/ton-user/NazunaBot.git
cd NazunaBot

# Installer les dépendances
npm install
```

---

## 🔑 Configuration

Créer un fichier `.env` à la racine du projet :

```env
# === Configuration API ===
GEMINI_API_KEY=TON_CLE_API

# === Session Baileys (ne pas modifier sauf besoin avancé) ===
SESSION_FOLDER=./session
```

---

## 🚀 Lancement

Démarrer le bot :

```bash
node bot.js
```

👉 Lors du premier lancement, un **code de pairage** sera généré :

- Ouvre WhatsApp → Paramètres → **Appareils liés**
- Clique sur **Lier un appareil avec code**
- Saisis le code affiché dans le terminal ✅

---

## 📂 Structure du projet

```
NazunaBot/
│── bot.js           # Fichier principal
│── nazunaAI.js      # Gestion des réponses IA via Gemini
│── config.js        # Configuration centrale
│── .env             # Variables d’environnement
│── /stickers/       # Dossier des stickers .webp
│── /session/        # Données de session WhatsApp (auto-générées)
```

---

## 📊 Aperçu des logs

Exemple de message reçu :

```
======================
📩 Nouveau message reçu
👤 Expéditeur: 120363378895570599@g.us
💬 Contenu brut: { ... }
➡️ Question utilisateur: Salut Nazuna !
 Réponse IA: Bonjour 👋, comment vas-tu ?
✨ Sticker envoyé: neko_smile.webp
```

---

## 📸 Screenshots & Démo

### 1. Terminal au lancement



### 2. Bot en conversation privée



### 3. Réponses dans un groupe



### 4. Démo animée (GIF)



👉 Tu pourras remplacer ce GIF par ton propre enregistrement avec [ScreenToGif](https://www.screentogif.com/) ou [Kap](https://getkap.co/).

---

## 🐞 Problèmes fréquents

### ❌ Erreur : `TypeError: Cannot read properties of null (reading 'stickerMessage')`

✔️ Correction : toujours vérifier `if (msg.message?.stickerMessage)` avant d’accéder aux stickers.\
👉 Déjà corrigé dans la dernière version du code.

### ❌ Impossible de se connecter

- Vérifie que ton numéro est valide
- Vérifie ta connexion internet
- Supprime le dossier `/session/` et relance pour regénérer un code

---

## 📜 Licence

Ce projet est sous licence **MIT** – libre d’utilisation, modification et distribution.

---

💡 Développé avec ❤️ pour automatiser WhatsApp et ajouter une touche d’IA 🌸

