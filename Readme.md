# 🤖 SUPREMUS AI - WhatsApp Roleplay Assistant

SUPREMUS AI est un bot WhatsApp intelligent développé par **SUPRÊMUS PROD** pour automatiser et enrichir l’expérience de jeu textuel dans la **SRPN (Supremus Rôle Play Nation)**.  
Basé sur **Baileys** et **Google Gemini AI**, il permet de répondre automatiquement aux messages, de gérer des activités RP et de publier des annonces officielles.

---

## 📑 Sommaire

1. [Fonctionnalités](#-fonctionnalités)
2. [Prérequis](#-prérequis)
3. [Installation](#-installation)
4. [Configuration](#-configuration)
5. [Lancement](#-lancement)
6. [Structure du projet](#-structure-du-projet)
7. [Exemple d’utilisation](#-exemple-dutilisation)
8. [Problèmes fréquents](#-problèmes-fréquents)
9. [Licence](#-licence)

---

## ✨ Fonctionnalités

- 🤖 **Réponses IA** avec l’API **Gemini**
- 🎮 Support des **jeux SRPN** :
  - ABM Fight
  - Origamy World
  - Yu-Gi-Oh Speed Duel
  - Speed Rush
- 📢 **Annonces officielles** (gagnant, perdant, score…)
- 🎴 Envoi de **stickers aléatoires** depuis `./stickers/`
- 📂 **Sessions sécurisées** avec Baileys (`./session/`)
- 🔔 Déclenchement automatique si :
  - Mention du bot dans un groupe
  - Réponse directe à un message du bot
  - Message privé (DM)
  - Commande SRPN spécifique

---

## 📦 Prérequis

- [Node.js](https://nodejs.org/) **v20.x ou supérieur**
- Un compte WhatsApp (numéro valide)
- Une clé API **Google Gemini**
- Git installé

---

## ⚙️ Installation

```bash
# Cloner le projet
git clone https://github.com/ton-user/SupremusAI.git
cd SupremusAI

# Installer les dépendances
npm install