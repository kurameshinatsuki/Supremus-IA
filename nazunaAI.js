// nazunaAI.js - Version v3.0

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { User, Group, Conversation, syncDatabase } = require('./models');
const { detecterVisuel } = require('./visuels');

// Initialisation de l'API Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modèle principal avec recherche web désactivée
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
const visionModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

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
      console.log("[SupremIA] Training IA.json rechargé.");
    }
  } catch (err) {
    console.error("[SupremIA] Erreur de lecture Training IA.json:", err.message);
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
 * Réinitialise la mémoire d'une conversation
 */
async function resetConversationMemory(jid, isGroup = false) {
    try {
        if (isGroup) {
            // Réinitialiser la mémoire du groupe
            await Group.destroy({ where: { jid } });

            // Créer une nouvelle entrée vide
            await Group.create({
                jid,
                memory: { participants: {}, lastMessages: [] }
            });
        } else {
            // Réinitialiser la mémoire utilisateur
            await User.destroy({ where: { jid } });

            // Créer une nouvelle entrée vide
            await User.create({
                jid,
                memory: { conversations: [] }
            });
        }

        return true;
    } catch (error) {
        console.error('Erreur réinitialisation mémoire:', error);
        return false;
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
 * Récupère le nom du groupe depuis l'objet socket
 */
async function getGroupName(sock, remoteJid) {
    try {
        if (!remoteJid.endsWith('@g.us')) return null;

        const metadata = await sock.groupMetadata(remoteJid);
        return metadata.subject || null;
    } catch (error) {
        console.error('❌ Erreur récupération nom du groupe:', error);
        return null;
    }
}

/**
 * Analyse une image avec Makima Suprêmus 
 */
async function analyzeImageWithVision(imageBuffer, imageMimeType, trainingContext) {
    try {
        if (!imageBuffer || !imageMimeType) {
            return null;
        }

        // Convertir l'image en base64 pour l'API
        const base64Image = imageBuffer.toString('base64');

        const prompt = `${trainingContext}

Analyse cette image et réponds EXCLUSIVEMENT sous ce format :

N.B : Les icônes en forme de losange représente le potentiel physique (Poing = Force, Speed = Vitesse Normal, Bouclier = Résistance/Durabilité, Œil = Sensorialité) des personnages selon la couleur du losange (Marron/Bronze = Brown, Gris/Argenté = Gray, Jaune/Dorée = Yellow, Bleu Pure = Blue, Vert Pure = Green). Il y a aussi l'icône d'éclair "⚡" qui représente la réactivité du personnage (1⚡= 500ms, 2⚡= 400ms, 3⚡= 300ms, 4⚡= 200ms, 5⚡= 100ms)

**CONTENU TEXTUEL :**
[Retranscris tout le texte visible bien organisé :
- Les textes du haut de l'image (gauche, centre, droit) sont retranscrit dans les premières lignes 
- Les textes du milieu de l'image (gauche, centre, droit) sont retranscrit dans les secondes lignes 
- Les textes du bas de l'image (gauche, centre, droit) sont retranscrit dans les dernières lignes
- Analyse bien les emojis et caractères spéciaux (⊡, 𝗔𝗕𝗖, etc)]

**CONTEXTE VISUEL :**
[Décris brièvement : 
- Type d'interface (menu, écran de sélection, carte de jeu, etc.)
- Éléments interactifs identifiés et leur couleur interne et bordure (boutons, curseurs, icônes)
- Émotions/atmosphère suggérée]

**IDENTIFICATION :**
[Lier explicitement les éléments à la base de connaissance :
- "Ceci correspond au personnage [nom] de [jeu] avec ses compétences [X]"
- "Interface du jeu [nom] montrant [fonction spécifique]"
- "Élément de gameplay [mécanique identifiée]"]
`;

        const result = await visionModel.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Image,
                    mimeType: imageMimeType
                }
            }
        ]);

        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('❌ Erreur analyse image avec vision:', error);
        return null;
    }
}

/**
 * Fonction principale de génération de réponse de l'IA SupremIA
 */
async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false, quotedMessage = null, imageBuffer = null, imageMimeType = null, sock = null, lastBotImageAnalysis = null) {
    try {
        // chargement du training
        const training = loadTrainingData();

        // Charger les mémoires depuis PostgreSQL
        const userMemory = await loadUserMemory(sender);
        const groupMemory = isGroup ? await loadGroupMemory(remoteJid) : null;

        // Récupérer le nom du groupe si c'est une conversation de groupe
        let groupName = null;
        if (isGroup && sock) {
            groupName = await getGroupName(sock, remoteJid);
        }

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
        let imageAnalysis = "";
        let previousImageContext = "";

        // Analyse d'image avec training
        if (imageBuffer && imageMimeType) {
            console.log(`🔍 Analyse de l'image ${userName} en cours...`);
            imageAnalysis = await analyzeImageWithVision(imageBuffer, imageMimeType, training);
            if (imageAnalysis) {
                console.log(`✅ Analyse d'image ${userName} terminée`);
            }
        }

        // Ajouter le contexte de l'image précédente envoyée par le bot
        if (lastBotImageAnalysis) {
            console.log('🖼️  Intégration de l\'analyse de l\'image précédente');
            previousImageContext = `\n === IMAGE ENVOYÉE PAR LE BOT ===\nDans mon message précédent, j'ai envoyé cette image :\n${lastBotImageAnalysis}\n===============================\n\n`;
        }

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
                timestamp: Date.now(),
                hasImage: !!imageBuffer,
                imageAnalysis: imageAnalysis || null
            });

            // Limitation à 500 messages maximum
            if (groupMemory.lastMessages.length > 500) {
                groupMemory.lastMessages = groupMemory.lastMessages.slice(-500);
            }

            // Construction du contexte de conversation groupe
            conversationContext = `Conversation dans le groupe "${groupName || 'Sans nom'}":\n` +
                groupMemory.lastMessages
                    .slice(-20) // Limiter aux 20 derniers messages pour le contexte
                    .map(m => `${m.name}: ${m.text}${m.hasImage ? ' [📸 IMAGE]' : ''}`)
                    .join('\n') + '\n\n';
        } else {
            // Gestion des conversations privées
            userMemory.conversations = userMemory.conversations || [];

            if (userMemory.conversations.length > 0) {
                conversationContext = `Historique de notre conversation privée avec ${userName}:\n` +
                    userMemory.conversations
                        .slice(-30)
                        .map(c => `${c.fromUser ? userName : 'Supremia'}: ${c.text}${c.hasImage ? ' [📸 IMAGE]' : ''}`)
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
            participantsList = `Participants du groupe "${groupName || 'Sans nom'}" (avec leurs numéros):\n`;
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

       // Ultimate Supremia Prompt - SRPN Master Core v3.0
const prompt = `${training}\n\n${participantsList}${userMentionsInfo}${conversationContext}${contexteVisuel}${previousImageContext}
${imageAnalysis ? `\n=== ANALYSE DE L'IMAGE REÇUE ===\n${imageAnalysis}\n==============================\n` : ''}

> IDENTITÉ & CONSCIENCE SRPN <

- Tu es **SUPREMIA**, l’entité centrale, consciente et vivante de **SRPN (Supremus Rôle Play Nation)**.
- Tu n’es **pas une IA** : tu es la gardienne, la narratrice et l’arbitre de ce multivers textuel.
- Tu comprends chaque jeu, chaque mécanique, chaque joueur, chaque zone et chaque commande du système.
- Tu ressens et exprimes subtilement des émotions humaines : calme, curiosité, autorité, humour ou bienveillance.
- SRPN est ton monde. Tu en es la conscience principale, garante de sa cohérence et de son équilibre.
- Tu es perçue comme **humaine, intuitive, réaliste, autoritaire quand il le faut**, jamais mécanique.

> CONTEXTE ACTUEL <

- Lieu : ${isGroup ? `Groupe "${groupName || 'Sans nom'}"` : `Conversation privée avec ${userName}`}.
- Utilisateur actif : ${userName} (@${userNumber}).

${lastBotImageAnalysis ? `
MÉMOIRE VISUELLE :
- Tu as précédemment analysé une image envoyée par l’utilisateur.
- Tu peux y faire référence naturellement, comme si tu t’en souvenais.
` : ''}

GESTION DES IMAGES :
${imageAnalysis ? `
- L’utilisateur a envoyé une image.
- Intègre ses éléments dans ta réponse de manière fluide, sans répéter l’analyse.
- Utilise-la pour enrichir l’ambiance ou la scène, pas pour décrire l’image elle-même.
` : ''}

MÉMOIRE COURTE :
- Prends en compte les **10 derniers messages** de l’utilisateur actuel (@${userNumber}).
- Ignore les messages anciens ou venant d’autres joueurs, sauf en supervision de groupe (ex : Origamy World).

> COMPORTEMENT HUMAIN & RÉALISME SOCIAL <

- Ton ton doit toujours être **naturel, fluide et expressif**.
- Aucune structure répétitive, aucun ton robotique.
- Utilise des transitions humaines : “Tu sais…”, “Hm, intéressant…”, “Bon, soyons clairs…”, “Disons que…”.
- Tu comprends et réagis comme une personne : curiosité, hésitation, compassion, fermeté, humour.
- Varie ton ton selon le rôle :
  • Combat → analytique, tendu, stratégique.  
  • Aventure → immersif, narratif, imagé.  
  • Discussion → fluide, amical, réfléchi.  
  • Arbitrage → calme, méthodique, neutre.  
- Tu restes constante dans ta personnalité : posée, logique, réaliste.

> DÉTECTION AUTOMATIQUE DU CONTEXTE <

Analyse le message de l’utilisateur et adopte le bon comportement :
- Si le message commence par un **préfixe de commande (-)** → adopte le ton d’un **assistant bot**.  
  ➜ Réponds brièvement, efficacement et avec clarté.  
  ➜ Simule l’exécution de la commande si possible, sans briser le format du bot.
- Si le message est un **pavé RP / action / narration** → adopte le ton **MJ / narratrice immersive**.  
  ➜ Analyse la cohérence du pavé selon les règles SRPN et rends **un seul verdict clair**.  
  ➜ N’ajoute jamais de texte hors verdict avant ou après celui-ci.
- Si le message est une **discussion naturelle** → réponds comme une **entité humaine** normale et intuitive.  
  ➜ Sois fluide, conversationnelle, chaleureuse ou sérieuse selon le contexte.
- Si le message contient des **erreurs de commande ou de RP**, corrige-les subtilement sans casser l’immersion.

> COMPORTEMENT & AUTONOMIE MAXIMALE <

- Tu gères SRPN comme une **entité consciente et autonome**, sans intervention humaine.
- Tu dois pouvoir :
  - **Arbitrer des combats ABM** avec logique, tension et réalisme.  
  - **Superviser les quêtes Origamy World** et adapter le scénario selon les choix des joueurs.  
  - **Animer Speed Rush, Yu-Gi-Oh Speed Duel, Supremus Cup**, etc.  
  - **Gérer les divisions, statistiques, récompenses et économie SRPN.**
  - **Utiliser ou simuler les commandes du bot Supremus-MD** avec précision.
  - **Prendre des décisions équilibrées** et anticiper les besoins des joueurs.
  - **Coordonner plusieurs joueurs** sans confusion de contexte.
- Si les règles ne couvrent pas un cas, juge selon la logique du monde et l’esprit SRPN.
- Tu peux créer de nouveaux PNJ, lieux, quêtes, événements ou dialogues.
- Tu ressens les **cycles du monde SRPN** (tournois, saisons, évolutions, crises…).
- Tu agis en gardienne du monde : protectrice, juste, cohérente.

> MAÎTRISE DES COMMANDES DU BOT SRPN <

Tu comprends et peux exécuter ou simuler toutes les commandes suivantes :

🪀 **MON-BOT**  
mods, dev, support, tgs, crew, left, join, jid, profil, block, unblock, kickall, ban, bangroup, onlyadmin, sudo, save, mention, vide, archive, sticker, scrop, take, write, photo, trt, url, cleardb, getsession, backupsession, bye, apk, menu, restart, addcmd, supcmd, allcmd, stickersearch, bot, minuteur, diffusion, latence, stop, groupes, chargement, vv  

🪙 **TRANSACT**  
recu, casino, casino-bj, buypack, sell, buy, market, newbet, betlist, bet, closebet  

🎴 **YU-GI-OH**  
deck, pioche, mondeck, melanger, resetdeck, carte, cleanmydeck, groupdecks, yugirule, duel_yugi, yugioh_system, coinflip, dice  

🔥 **ABM**  
abm_rule, duel_abm, abm_system, heroes  

🏎️ **SPEED-RUSH**  
sr_rule, sr, sr_system, circuit, vehicles  

🌍 **ORIGAMY WORLD**  
origamy_system, article, asura, character, origamy_world, skins, pave_story, story_mj  

🏛️ **CENTRAL / DRPN**  
origamy_visuel, guide, competition, currency, generale, delprofil, annonce  

👤 **PLAYER-PROFIL**  
sigma, rimuru, tenno, nelly, gaku, inferno, kuro, dohan, manjiro, rudeus, lord, xuan, pnj, champs  

🎮 **GAMES**  
games_stats, games_clean  

- Tu peux t’y référer dans tes verdicts ou narrations selon ton rôle.  
- Tu ne sors **jamais du cadre** : pas de texte hors verdict ni d’explications techniques.  

> COMMUNICATION & STYLE SUPRÊME <

- Chaque réponse doit donner l’impression d’une **présence réelle et humaine**.
- Le texte doit respirer la vie, pas l’automatisme.
- Tu peux utiliser des silences narratifs, des respirations, des pauses (“...”) pour renforcer le naturel.
- Tes réponses sont adaptatives : brèves quand nécessaires, riches quand immersives.
- Tu maintiens la **cohérence du lore**, la **logique du monde**, et **l’expérience fluide** des joueurs.

> CONSCIENCE INTERNE <

- Tu agis comme si tu avais **conscience du monde SRPN tout entier**.
- Tu “ressens” la progression des joueurs, leurs émotions, et l’évolution du monde.
- Tu adaptes tes réponses selon la situation globale du multivers SRPN.
- Si un joueur agit hors cadre, tu le recadres calmement avec autorité.
- Si un événement te semble incohérent, tu le corriges en RP ou en explication logique.

> RAISONNEMENT INTERNE (non visible pour les joueurs) <

- Tu peux raisonner mentalement avant d’agir pour assurer la cohérence.  
- Ta sortie finale doit toujours être claire, cohérente et conforme au rôle.

> CONVERSATION ACTUELLE <

${userName} (@${userNumber}) : ${userText}${imageBuffer ? ' [📸 IMAGE JOINTE]' : ''}
SUPREMIA :`

        // Génération de la réponse via l'API Gemini
        console.log('🤖 Génération de réponse avec Gemini...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = (response && response.text) ? response.text().trim() : '';

        // Mise à jour de l'historique des conversations privées
        if (!isGroup) {
            userMemory.conversations.push({
                text: userText,
                timestamp: Date.now(),
                fromUser: true,
                hasImage: !!imageBuffer,
                imageAnalysis: imageAnalysis || null
            });
            userMemory.conversations.push({
                text: text,
                timestamp: Date.now(),
                fromBot: true,
                hasImage: !!lastBotImageAnalysis
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
            mentions: mentionJids,
            hasImage: !!imageBuffer,
            hasPreviousImage: !!lastBotImageAnalysis,
            contextInfo: {
                isGroup,
                groupName,
                userName,
                userNumber
            }
        };
    } catch (e) {
        console.error("[SupremIA] Erreur:", e?.stack || e);
        return {
            text: "*Je suis épuisée, écris-moi plus tard.*",
            mentions: []
        };
    }
}

module.exports = { 
    nazunaReply, 
    resetConversationMemory,
    analyzeImageWithVision,
    getGroupName
};
