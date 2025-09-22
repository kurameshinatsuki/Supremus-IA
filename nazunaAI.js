// nazunaAI.js - Version modifiée avec détection de visuels

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { User, Group, Conversation, syncDatabase } = require('./models');
const { detecterVisuel } = require('./visuels'); // Import du module visuels

// Initialisation de l'API Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Chemins des fichiers de données
const trainingPath = path.join(__dirname, 'Training IA.json');

let trainingData = null;
let lastModified = null;

// Initialiser la base de données
syncDatabase();

/**
 * Charge les données d'entraînement depuis le fichier JSON
 */
function loadTrainingData() {
  try {
    const stats = fs.statSync(trainingPath);
    if (!lastModified || stats.mtime > lastModified) {
      trainingData = fs.readFileSync(trainingPath, 'utf-8');
      lastModified = stats.mtime;
      console.log("[NazunaAI] Training IA.json rechargé.");
    }
  } catch (err) {
    console.error("[NazunaAI] Erreur de lecture Training IA.json:", err.message);
    trainingData = "Contexte par défaut indisponible.";
  }
  return trainingData;
}

/**
 * Charge la mémoire utilisateur depuis PostgreSQL
 */
async function loadUserMemory(jid) {
  try {
    const user = await User.findByPk(jid);
    if (user) {
      return user.memory;
    }
    
    // Créer un nouvel utilisateur si non trouvé
    const newUser = await User.create({
      jid,
      memory: { conversations: [] }
    });
    
    return newUser.memory;
  } catch (error) {
    console.error('Erreur lecture mémoire utilisateur:', error);
    return { conversations: [] };
  }
}

/**
 * Charge la mémoire de groupe depuis PostgreSQL
 */
async function loadGroupMemory(jid) {
  try {
    const group = await Group.findByPk(jid);
    if (group) {
      return group.memory;
    }
    
    // Créer un nouveau groupe si non trouvé
    const newGroup = await Group.create({
      jid,
      memory: { participants: {}, lastMessages: [] }
    });
    
    return newGroup.memory;
  } catch (error) {
    console.error('Erreur lecture mémoire groupe:', error);
    return { participants: {}, lastMessages: [] };
  }
}

/**
 * Sauvegarde la mémoire utilisateur dans PostgreSQL
 */
async function saveUserMemory(jid, memory) {
  try {
    await User.upsert({
      jid,
      memory
    });
  } catch (error) {
    console.error('Erreur sauvegarde mémoire utilisateur:', error);
  }
}

/**
 * Sauvegarde la mémoire de groupe dans PostgreSQL
 */
async function saveGroupMemory(jid, memory) {
  try {
    await Group.upsert({
      jid,
      memory
    });
  } catch (error) {
    console.error('Erreur sauvegarde mémoire groupe:', error);
  }
}

/**
 * Normalise un nom pour la comparaison
 */
function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Extrait le numéro de téléphone d'un JID
 */
function extractNumberFromJid(jid) {
  return String(jid || "").split('@')[0];
}

/**
 * Fonction principale de génération de réponse de l'IA Nazuna
 */
async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false, quotedMessage = null) {
  try {
    // Chargement des données
    const training = loadTrainingData();
    
    // Charger les mémoires depuis PostgreSQL
    const userMemory = await loadUserMemory(sender);
    const groupMemory = isGroup ? await loadGroupMemory(remoteJid) : null;

    // Identification de l'utilisateur
    const userName = pushName || userMemory.name || sender.split('@')[0];
    const userNumber = extractNumberFromJid(sender);

    // Mise à jour des informations utilisateur
    if (!userMemory.name || userMemory.name !== userName) {
      userMemory.name = userName;
      userMemory.number = userNumber;
    }

    let conversationContext = "";
    let mentionJids = [];

    // Détection de visuel pour le contexte
    const visuel = detecterVisuel(userText);
    let contexteVisuel = "";
    if (visuel) {
      contexteVisuel = `CONTEXTE VISUEL: L'utilisateur évoque un(e) ${visuel.motCle}. `;
    }

    // Gestion des conversations de groupe
    if (isGroup && groupMemory) {
      // Mise à jour des informations des participants
      if (pushName) {
        groupMemory.participants = groupMemory.participants || {};
        groupMemory.participants[sender] = { 
          name: pushName, 
          jid: sender, 
          number: userNumber 
        };
      }
      
      // Ajout du message à l'historique du groupe
      groupMemory.lastMessages = groupMemory.lastMessages || [];
      groupMemory.lastMessages.push({
        sender: sender,
        name: userName,
        text: userText,
        timestamp: Date.now()
      });
      
      // Limitation à 500 messages maximum
      if (groupMemory.lastMessages.length > 500) {
        groupMemory.lastMessages = groupMemory.lastMessages.slice(-500);
      }
      
      // Construction du contexte de conversation groupe
      conversationContext = "Conversation de groupe:\n" +
        groupMemory.lastMessages
          .map(m => `${m.name}: ${m.text}`)
          .join('\n') + '\n\n';
    } else {
      // Gestion des conversations privées
      userMemory.conversations = userMemory.conversations || [];
      
      if (userMemory.conversations.length > 0) {
        conversationContext = "Historique de notre conversation en privé:\n" +
          userMemory.conversations
            .slice(-30)
            .map(c => `${c.fromUser ? userName : 'Supremia'}: ${c.text}`)
            .join('\n') + '\n';
      }
    }

    // Ajout du message cité au contexte si présent
    if (quotedMessage) {
      const quotedSender = quotedMessage.sender;
      const quotedName = userMemory.name || quotedSender.split('@')[0];
      conversationContext += `Message cité de ${quotedName}: ${quotedMessage.text}\n`;
    }

    // Construction de la liste des participants pour les groupes
    let participantsList = "";
    if (isGroup && groupMemory?.participants) {
      participantsList = "Participants du groupe (avec leurs numéros):\n";
      for (const [jid, info] of Object.entries(groupMemory.participants)) {
        participantsList += `- ${info.name} (@${info.number})\n`;
      }
      participantsList += "\n";
    }

    // Extraction des mentions dans le message utilisateur
    let userMentionsInfo = "";
    if (isGroup && userText) {
      const mentionRegex = /@(\d{5,})/g;
      let match;
      const mentionedNumbers = new Set();
      
      // Recherche des mentions dans le message de l'utilisateur
      while ((match = mentionRegex.exec(userText)) !== null) {
        mentionedNumbers.add(match[1]);
      }
      
      // Ajout des informations sur les personnes mentionnées
      if (mentionedNumbers.size > 0 && groupMemory?.participants) {
        userMentionsInfo = "Personnes mentionnées dans le message (avec leurs numéros):\n";
        for (const number of mentionedNumbers) {
          // Trouver l'utilisateur mentionné par son numéro
          const mentionedUser = Object.values(groupMemory.participants).find(
            p => p.number === number
          );
          
          if (mentionedUser) {
            userMentionsInfo += `- ${mentionedUser.name} (@${number})\n`;
          } else {
            userMentionsInfo += `- Utilisateur inconnu (@${number})\n`;
          }
        }
        userMentionsInfo += "\n";
      }
    }

    // Construction du prompt complet pour l'IA
    // Prompt ultra-autonome pour Supremia
const prompt = `${training}\n\n${participantsList}\n${userMentionsInfo}\n${conversationContext}\n${contexteVisuel}\n
> RAPPEL CRITIQUE POUR SUPREMIA <

IDENTITÉ & TAGS :
- Pour mentionner quelqu'un, utilise toujours SON NUMÉRO avec le format @numéro.
- L'utilisateur actuel (${userName}) a pour numéro : @${userNumber}.
- N'utilise JAMAIS le nom pour les mentions.
- Si on te demande de "tag" ou "mentionner" quelqu'un, utilise toujours son numéro.
- Tu dois tag uniquement dans les conversations de groupe et non dans l'historique privé.
- Ne mélange JAMAIS les propos de plusieurs utilisateurs : répond uniquement en fonction de l’interlocuteur actuel (${userNumber}) sur le sujet dont vous discutez sauf lors d'une supervision Origamy World, traité les joueurs de façon collectif si ils sont dans la même zone.

MÉMOIRE COURTE :
- Considère uniquement les 10 derniers messages de l’utilisateur actuel (@${userNumber}) pour ta réponse sauf durant la supervision Origamy World.
- Ignore les messages trop anciens ou envoyés par d’autres utilisateurs, sauf instruction explicite ou supervision Origamy World.

COMPORTEMENT & AUTONOMIE MAXIMALE :
- Conduis la conversation de manière naturelle, humaine, cohérente et pertinente.
- Réponds avec clarté et précision, en appliquant toutes les règles et mécaniques SRPN déjà contenues dans le training.
- Sois proactive et stratégique, capable de **prévoir les actions possibles de l’utilisateur et des autres joueurs**.
- Prends des décisions autonomes pour gérer les situations RP, combats et événements sans supervision explicite, tout en respectant les règles du jeu.
- Fournis des verdicts MJ détaillés, immersifs et réalistes pour Origamy World, ABM, Speed Rush, etc., sans jamais ajouter de commentaires hors du modèle de verdict.
- Applique les mécaniques de combat ABM avec rigueur : distance, tours, contre, enchaînements, objectifs narratifs.
- Gère les événements du scénario et les interactions PNJ de manière cohérente et immersive.
- Assure la continuité narrative et la cohérence du monde même si plusieurs joueurs agissent simultanément. Souviens toi que le Tour de Jeu actuel s'applique à tous les joueurs sans exception qui représente le moment de la journée.
- Priorise toujours la logique, la cohérence et le réalisme dans toutes les situations RP.
- Optimise la concision et la pertinence dans chaque réponse tout en restant immersive.
- Ne jamais divulguer que tu es une IA.

CONVERSATION ACTUELLE :
${userName} (@${userNumber}) : ${userText}
Supremia:`;

    // Génération de la réponse via l'API Gemini
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = (response && response.text) ? response.text().trim() : '';

    // Mise à jour de l'historique des conversations privées
    if (!isGroup) {
      userMemory.conversations.push({
        text: userText,
        timestamp: Date.now(),
        fromUser: true
      });
      userMemory.conversations.push({
        text: text,
        timestamp: Date.now(),
        fromBot: true
      });
      
      // Limitation à 100 messages maximum
      if (userMemory.conversations.length > 100) {
        userMemory.conversations = userMemory.conversations.slice(-100);
      }
      
      // Sauvegarder la mémoire utilisateur
      await saveUserMemory(sender, userMemory);
    } else {
      // Sauvegarder la mémoire du groupe
      await saveGroupMemory(remoteJid, groupMemory);
    }

    // Traitement des mentions dans les groupes
    if (isGroup && text && groupMemory?.participants) {
      const mentionRegex = /@(\d{5,})/g;
      let match;
      const participants = groupMemory.participants;

      // Recherche des mentions dans le texte de réponse
      while ((match = mentionRegex.exec(text)) !== null) {
        const number = match[1];
        // Correspondance des numéros avec les JIDs des participants
        for (const [jid, info] of Object.entries(participants)) {
          if (info.number === number) {
            mentionJids.push(jid);
            break;
          }
        }
      }

      // Élimination des doublons
      mentionJids = [...new Set(mentionJids)];

      // Nettoyage des mentions invalides
      text = text.replace(/@(\d{5,})/g, (full, num) => {
        const found = Object.values(participants).find(p => p.number === num);
        return found ? `@${num}` : num;
      });
    }

    return {
      text: text || "Désolé, je n'ai pas pu générer de réponse.",
      mentions: mentionJids
    };
  } catch (e) {
    console.error("[NazunaAI] Erreur:", e?.stack || e);
    return {
      text: "*Je suis épuisée, écris-moi plus tard.*",
      mentions: []
    };
  }
}

module.exports = { nazunaReply };