// visuels.js - Gestion des visuels avec détection de mots-clés avancés

const visuels = {
  // Visuels de jeux
  'srpn': 'https://i.ibb.co/Xr38T6sW/file-00000000209c6243937d67ba930ce045.jpg',
  'speed rush 🚘': 'https://i.ibb.co/k6cMHkPz/Whats-App-Image-2025-06-17-at-19-20-21-2.jpg',
  'abm': 'https://i.ibb.co/5xhN2WhP/Whats-App-Image-2025-06-17-at-19-20-21-1-1.jpg',
  'yu-gi-oh': 'https://exemple.com/images/marche.jpg',
  'origamy world': 'https://i.ibb.co/LtFzy6j/Image-2024-10-05-12-16-43.jpg',
  
  // Zone Sud
  'porte principale': 'https://i.ibb.co/MpxhHrd/20240927-212108.jpg',
  'transport public': 'https://i.ibb.co/5WjszYy/20240927-221021.jpg',
  'cimetiere': 'https://i.ibb.co/Kh3JdMK/20240927-221342.jpg',
  'bois sacres': 'https://i.ibb.co/3mpGZhf/20240927-221704.jpg',

  // Zone Ouest
  'colisee aurelius': 'https://i.ibb.co/RBPVVNz/20240927-222034.jpg',
  'arene souterraine': 'https://i.ibb.co/SnqSzGk/20240927-222306.jpg',
  'centre commandement': 'https://i.ibb.co/L091WtQ/20240927-222537.jpg',
  'camp entrainement': 'https://i.ibb.co/0MXQjcy/20240927-222739.jpg',
  'academie arcana': 'https://i.ibb.co/WvfbbgK/20240927-223020.jpg',
  'caserne garde': 'https://i.ibb.co/MVFJzh1/20240927-223321.jpg',
  'entree restreinte': 'https://i.ibb.co/QmMF8B6/20240927-223830.jpg',

  // Centre Ville
  'marche central': 'https://i.ibb.co/nBZ08Lh/20240927-224242.jpg',
  'luxury taverne': 'https://i.ibb.co/2N3ZKtr/20240927-224604.jpg',
  'baguette doree': 'https://i.ibb.co/4dKMmWq/20240927-224809.jpg',
  'forge edward': 'https://i.ibb.co/Qd80mx4/20240927-225101.jpg',
  'grand bazar': 'https://i.ibb.co/hRpgVLP/20240927-225518.jpg',
  'bureau missions': 'https://i.ibb.co/sWt3HFh/20240927-225230.jpg',
  'banque tresors': 'https://i.ibb.co/51qmnJJ/20240927-233900.jpg',
  'bains sagacia': 'https://i.ibb.co/bJPbxW2/20240927-230107.jpg',
  'gallerie arts': 'https://i.ibb.co/4m005vx/20240927-233715.jpg',
  'grande bibliotheque': 'https://i.ibb.co/0YkNDvc/20240927-230702.jpg',
  'centre medical': 'https://i.ibb.co/G3ztCpW/20240927-230914.jpg',
  'chambre medical': 'https://i.ibb.co/vmN0SSr/20240927-231229.jpg',
  'laboratoire oris': 'https://i.ibb.co/mBqrG20/20240927-233225.jpg',
  'quartier residentiel': 'https://i.ibb.co/G5jPJN8/20240927-233347.jpg',

  // Zone Est
  'salle jeux': 'https://i.ibb.co/jv8q587/20240927-234214.jpg',
  'bains royaux': 'https://i.ibb.co/zX3NZrR/20240927-234341.jpg',
  'residences nobles': 'https://i.ibb.co/RCpMXYj/20240927-234545.jpg',
  'entree privee': 'https://i.ibb.co/tKQCYHb/20240927-223933.jpg',
  'nobles couture': 'https://i.ibb.co/thkwBjn/20240927-234927.jpg',

  // Zone Nord
  'cour honneur': 'https://i.ibb.co/2YMF9QC/20240927-235106.jpg',
  'palais royal': 'https://i.ibb.co/k4ZSCtD/20240927-235254.jpg',
  'salle trone': 'https://i.ibb.co/5Tr77gw/20240927-235428.jpg',
  'jardins prives': 'https://i.ibb.co/j8R23mF/20240927-235952.jpg',
  'hall gardiens': 'https://i.ibb.co/t2Txdd8/20240928-000303.jpg',
  'oubliettes couloir': 'https://i.ibb.co/3mcQzpb/20240927-235656.jpg',
  'oubliettes cachots': 'https://i.ibb.co/CwZk2nF/20240927-235758.jpg',
  'ecuries royales': 'https://i.ibb.co/VgCPhyd/20240928-000526.jpg',
  'tour astral': 'https://i.ibb.co/fCRgqwy/20240928-001305.jpg',
  'arsenal royaux': 'https://i.ibb.co/HGhxgDs/20240928-001444.jpg',

  // Sous-lieux non illustrés Origamy World
  'chambre eco': 'https://i.ibb.co/QYzgXNg/20240928-001822.jpg',
  'terrain exercice': 'https://i.ibb.co/sj9z6jC/20240928-000853.jpg',
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