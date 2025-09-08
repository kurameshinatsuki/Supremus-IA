// visuels.js - Gestion des visuels avec détection de mots-clés avancés

const visuels = {
  // Visuels de jeux
  'srpn 🎮': 'https://i.ibb.co/Xr38T6sW/file-00000000209c6243937d67ba930ce045.jpg',
  'speed rush 🚘': 'https://i.ibb.co/k6cMHkPz/Whats-App-Image-2025-06-17-at-19-20-21-2.jpg',
  'abm 🆚': 'https://i.ibb.co/5xhN2WhP/Whats-App-Image-2025-06-17-at-19-20-21-1-1.jpg',
  'yu-gi-oh 🎴': 'https://exemple.com/images/marche.jpg',
  'origamy world 🌐': 'https://i.ibb.co/LtFzy6j/Image-2024-10-05-12-16-43.jpg',
  
  // Personnages
  'makima': 'https://i.ibb.co/jkn9Kwyq/image.jpg',
  'supremia': 'https://i.ibb.co/G4xq4Gz1/image.jpg',
};

/**
 * Nettoie et normalise le texte pour la détection de mots-clés
 */
function normaliserTexte(texte) {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\p{Emoji}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Détecte un visuel correspondant au texte
 */
function detecterVisuel(texte) {
  const texteNormalise = normaliserTexte(texte);
  
  for (const [motCle, urlImage] of Object.entries(visuels)) {
    const motCleNormalise = normaliserTexte(motCle);
    
    // Détection par parties pour gérer les espaces
    const partiesMotCle = motCleNormalise.split(' ');
    const texteContientToutesParties = partiesMotCle.every(partie => 
      texteNormalise.includes(partie)
    );
    
    if (texteContientToutesParties) {
      return { motCle, urlImage };
    }
  }
  
  return null;
}

/**
 * Récupère tous les mots-clés disponibles
 */
function obtenirMotsCles() {
  return Object.keys(visuels);
}

module.exports = {
  visuels,
  detecterVisuel,
  obtenirMotsCles
};