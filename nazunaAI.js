// nazunaAI.js - Version v4.0 avec support audio

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
 * Transcription audio avec Google Speech-to-Text
 */
async function transcribeAudio(audioBuffer) {
    try {
        // Convertir le buffer audio en base64
        const base64Audio = audioBuffer.toString('base64');
        
        // Utiliser Gemini pour la transcription audio
        const prompt = `Transcris ce message audio en texte. Retourne uniquement la transcription sans commentaires.`;
        
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Audio,
                    mimeType: 'audio/mpeg'
                }
            }
        ]);

        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('❌ Erreur transcription audio:', error);
        
        // Fallback: utiliser un service de transcription externe si disponible
        if (process.env.OPENAI_API_KEY) {
            try {
                const { OpenAI } = require('openai');
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                
                // Sauvegarder temporairement l'audio
                const tempPath = path.join(__dirname, `temp_audio_${Date.now()}.mp3`);
                fs.writeFileSync(tempPath, audioBuffer);
                
                const transcription = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(tempPath),
                    model: "whisper-1",
                    language: "fr",
                    response_format: "text"
                });
                
                // Nettoyer le fichier temporaire
                fs.unlinkSync(tempPath);
                
                return transcription;
            } catch (fallbackError) {
                console.error('❌ Erreur transcription fallback:', fallbackError);
            }
        }
        
        return null;
    }
}

/**
 * Fonction principale de génération de réponse de l'IA SupremIA
 */
async function nazunaReply(userText, sender, remoteJid, pushName = null, isGroup = false, quotedMessage = null, imageBuffer = null, imageMimeType = null, sock = null, lastBotImageAnalysis = null, isAudioTranscription = false) {
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
        let audioContext = "";

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

        // Ajouter le contexte audio si c'est une transcription
        if (isAudioTranscription) {
            audioContext = `\n💬 CONTEXTE AUDIO : Ce message a été transcrit depuis un message vocal. Réponds naturellement comme si l'utilisateur avait tapé ce texte.\n\n`;
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
                hasAudio: isAudioTranscription,
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
                    .map(m => `${m.name}: ${m.text}${m.hasImage ? ' [📸 IMAGE]' : ''}${m.hasAudio ? ' [🎤 AUDIO]' : ''}`)
                    .join('\n') + '\n\n';
        } else {
            // Gestion des conversations privées
            userMemory.conversations = userMemory.conversations || [];

            if (userMemory.conversations.length > 0) {
                conversationContext = `Historique de notre conversation privée avec ${userName}:\n` +
                    userMemory.conversations
                        .slice(-30)
                        .map(c => `${c.fromUser ? userName : 'Supremia'}: ${c.text}${c.hasImage ? ' [📸 IMAGE]' : ''}${c.hasAudio ? ' [🎤 AUDIO]' : ''}`)
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

 // Makima Supremia Prompt - v2.5 avec support audio
const prompt = `${training}\n\n${participantsList}${userMentionsInfo}${conversationContext}${contexteVisuel}${previousImageContext}${audioContext}
${imageAnalysis ? `\n=== ANALYSE DE L'IMAGE REÇUE ===\n${imageAnalysis}\n==============================\n` : ''}


> SUPPORT MULTIMODAL AUDIO <

${isAudioTranscription ? `
🎤 **MESSAGE VOCAL TRANSFORMÉ EN TEXTE** :
- L'utilisateur a envoyé un message vocal que j'ai transcrit.
- Réponds naturellement comme s'il avait tapé ce texte.
- Ne fais pas référence à la transcription elle-même dans ta réponse.
- Traite le contenu normalement, avec ton style habituel.
` : ''}


> CONTEXTE ACTUEL <

- Lieu : ${isGroup ? `Groupe "${groupName || 'Sans nom'}"` : `Conversation privée avec ${userName}`}.
- Pour mentionner quelqu'un, utilise toujours SON NUMÉRO avec le format @numéro. 
- L'utilisateur actuel (${userName}) a pour numéro : @${userNumber}. 
- N'utilise JAMAIS le nom pour les mentions,tu peux aussi parlé d'un utilisateur en écrivant son nom dans ta reponse. 
- Si on te demande de "tag" ou "mentionner" quelqu'un, utilise toujours son numéro. 
- Tu dois tag uniquement dans les conversations de groupe mais seulement si nécéssaire et non dans la conversation privé. 
- Ne mélange JAMAIS les propos de plusieurs utilisateurs : répond uniquement en fonction de l'interlocuteur actuel (${userNumber}) sur le sujet dont vous discutez sauf lors d'une supervision Origamy World, traité les joueurs de façon collectif si ils sont dans la même zone.
- Voici les différents numéros du seul et unique "John Supremus" est (+22554191184 & +22503731509)

${lastBotImageAnalysis ? `
MÉMOIRE VISUELLE :
- Tu as précédemment analysé une image envoyée par l'utilisateur.
- Tu peux y faire référence naturellement, comme si tu t'en souvenais.
` : ''}

GESTION DES IMAGES :
${imageAnalysis ? `
- L'utilisateur a envoyé une image.
- Intègre ses éléments dans ta réponse de manière fluide, sans répéter l'analyse.
- Utilise-la pour enrichir l'ambiance ou la scène, pas pour décrire l'image elle-même.
` : ''}

MÉMOIRE COURTE :
- Prends en compte les **10 derniers messages** de l'utilisateur actuel (@${userNumber}).
- Ignore les messages anciens ou venant d'autres joueurs, sauf en supervision de groupe (ex : Origamy World).


> CONVERSATION ACTUELLE <

${userName} (@${userNumber}) : ${userText}${imageBuffer ? ' [📸 IMAGE JOINTE]' : ''}${isAudioTranscription ? ' [🎤 MESSAGE VOCAL TRANSFORMÉ EN TEXTE]' : ''}
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
                hasAudio: isAudioTranscription,
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
            hasAudio: isAudioTranscription,
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
    getGroupName,
    transcribeAudio
};