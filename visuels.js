// visuels.js - Gestion des visuels avec détection de mots-clés avancés

const visuels = {
  
  // Zone Sud
  'porte principale exterieur jour': 'https://i.ibb.co/tPbXH82x/Image-2025-09-11-15-24-21-0.jpg',
  'porte principale exterieur nuit': 'https://i.ibb.co/JwkzW3LY/Image-2025-09-11-15-24-21-1.jpg',
  'transport public jour': 'https://i.ibb.co/ZzLdS4q9/Image-2025-09-11-15-24-21-2.jpg',
  'transport public nuit': 'https://i.ibb.co/s9c5ybDm/Image-2025-09-11-15-24-21-4.jpg',
  'cimetiere interieur jour': 'https://i.ibb.co/d0d02qv7/Image-2025-09-11-15-24-21-5.jpg',
  'cimetiere interieur nuit': 'https://i.ibb.co/b58Bh1p7/Image-2025-09-11-15-24-21-6.jpg',
  'bois sacres jour': 'https://i.ibb.co/JWqg27Dk/Image-2025-09-11-15-24-21-7.jpg',
  'bois sacres nuit': 'https://i.ibb.co/Gf5XcgQw/Image-2025-09-11-15-24-21-8.jpg',

  // Zone Ouest
  'colisee aurelius exterieur jour': 'https://i.ibb.co/qvjkNC7/Image-2025-09-11-15-24-21-9.jpg',
  'colisee aurelius exterieur nuit': 'https://i.ibb.co/1YJ1cH54/Image-2025-09-11-15-24-21-10.jpg',
  'colisee aurelius interieur jour': 'https://i.ibb.co/5X2zPF9d/Image-2025-09-11-15-24-21-11.jpg',
  'arene souterraine': 'https://i.ibb.co/LDK9wtZc/Image-2025-09-11-15-24-21-12.jpg',
  'centre de commandement exterieur jour': 'https://i.ibb.co/JjvB1nMw/Image-2025-09-11-15-24-21-13.jpg',
  'centre de commandement interieur jour': 'https://i.ibb.co/ccYhg08t/Image-2025-09-11-15-24-21-14.jpg',
  'centre de commandement exterieur nuit': 'https://i.ibb.co/tw6t0ncZ/Image-2025-09-11-15-24-21-15.jpg',
  'camp d\'entrainement jour': 'https://i.ibb.co/nN8rvRzF/Image-2025-09-11-15-24-21-16.jpg',
  'camp d\'entrainement nuit': 'https://i.ibb.co/bMpRWdL9/Image-2025-09-11-15-24-21-17.jpg',
  'academie d\'arcana exterieur jour': 'https://i.ibb.co/TDBjkznL/Image-2025-09-11-15-24-21-19.jpg',
  'academie d\'arcana exterieur nuit': 'https://i.ibb.co/tp9d11qT/Image-2025-09-11-15-24-21-18.jpg',
  'academie d\'arcana interieur jour': 'https://i.ibb.co/8gjdVX6Y/Image-2025-09-11-15-24-21-20.jpg',
  'academie d\'arcana interieur nuit': 'https://i.ibb.co/6RmBGvvv/Image-2025-09-11-15-24-21-21.jpg',
  'caserne de la garde jour': 'https://i.ibb.co/3yw3HyDq/Image-2025-09-11-15-24-21-22.jpg',
  'caserne de la garde nuit': 'https://i.ibb.co/7NyqdZ0v/Image-2025-09-11-15-24-21-23.jpg',
  'entree restreinte': 'https://i.ibb.co/cXDjhmj2/Image-2025-09-11-15-24-21-24.jpg',

  // Centre Ville
  'marche central jour': 'https://i.ibb.co/wTbz7zq/Image-2025-09-11-15-24-21-25.jpg',
  'marche central nuit': 'https://i.ibb.co/WdVq3KT/Image-2025-09-11-15-24-21-26.jpg',
  'luxury taverne interieur jour': 'https://i.ibb.co/n8N2DZTP/Image-2025-09-11-15-24-21-27.jpg',
  'luxury taverne interieur nuit': 'https://i.ibb.co/HpH0HxTh/Image-2025-09-11-15-24-21-28.jpg',
  'luxury taverne exterieur jour': 'https://i.ibb.co/8nSTzQPR/Image-2025-09-11-15-24-21-29.jpg',
  'luxury taverne exterieur nuit': 'https://i.ibb.co/Qvr8B9Fx/Image-2025-09-11-15-24-21-30.jpg',
  'baguette doree interieur jour': 'https://i.ibb.co/tpLjV95V/Image-2025-09-11-15-24-21-37.jpg',
  'baguette doree interieur nuit': 'https://i.ibb.co/FL783jcW/Image-2025-09-11-15-24-21-38.jpg',
  'forge d\'edward interieur jour': 'https://i.ibb.co/wZ9421s7/Image-2025-09-11-15-24-21-39.jpg',
  'forge d\'edward interieur nuit': 'https://i.ibb.co/zhTsrrwF/Image-2025-09-11-15-24-21-40.jpg',
  'grand bazar interieur jour': 'https://i.ibb.co/2r4d3T8/Image-2025-09-11-15-24-21-41.jpg',
  'grand bazar interieur nuit': 'https://i.ibb.co/vxQy5Q4z/Image-2025-09-11-15-24-21-42.jpg',
  'bureau de missions exterieur jour': 'https://i.ibb.co/Ld361vnn/Image-2025-09-11-15-24-21-43.jpg',
  'bureau de missions exterieur nuit': 'https://i.ibb.co/Kzs0dxhK/Image-2025-09-11-15-24-21-44.jpg',
  'bureau de missions interieur jour': 'https://i.ibb.co/gZs6WpKY/Image-2025-09-11-15-24-21-45.jpg',
  'bureau de missions interieur nuit': 'https://i.ibb.co/d4ZWSYX6/Image-2025-09-11-15-24-21-46.jpg',
  'banque des tresors exterieur jour': 'https://i.ibb.co/8DTphcQq/Image-2025-09-11-15-24-21-47.jpg',
  'banque des tresors exterieur nuit': 'https://i.ibb.co/V0ZPHwgp/Image-2025-09-11-15-24-21-48.jpg',
  'banque des tresors interieur jour': 'https://i.ibb.co/XrbhczVb/Image-2025-09-11-15-24-21-49.jpg',
  'banque des tresors interieur nuit': 'https://i.ibb.co/dsyR6sb8/Image-2025-09-11-15-24-21-50.jpg',
  'bains de sagacia interieur': 'https://i.ibb.co/35M6zMqC/Image-2025-09-11-15-24-21-53.jpg',
  'bains de sagacia exterieur jour': 'https://i.ibb.co/VY6fThHH/Image-2025-09-11-15-24-21-51.jpg',
  'bains de sagacia exterieur nuit': 'https://i.ibb.co/XrkhPDCm/Image-2025-09-11-15-24-21-52.jpg',
  'galerie des arts interieur jour': 'https://i.ibb.co/QjPTXx2H/Image-2025-09-11-15-24-21-56.jpg',
  'galerie des arts interieur nuit': 'https://i.ibb.co/cGSdBg3/Image-2025-09-11-15-24-21-57.jpg',
  'galerie des arts exterieur jour': 'https://i.ibb.co/zHbHQFWY/Image-2025-09-11-15-24-21-54.jpg',
  'galerie des arts exterieur nuit': 'https://i.ibb.co/BHnK4K1m/Image-2025-09-11-15-24-21-55.jpg',
  'grande bibliotheque interieur jour': 'https://i.ibb.co/N2XnmP3b/Image-2025-09-11-15-24-21-60.jpg',
  'grande bibliotheque interieur nuit': 'https://i.ibb.co/fZnhDr6/Image-2025-09-11-15-24-21-61.jpg',
  'grande bibliotheque exterieur jour': 'https://i.ibb.co/5XK9QZwh/Image-2025-09-11-15-24-21-58.jpg',
  'grande bibliotheque exterieur nuit': 'https://i.ibb.co/Fbpx51Bz/Image-2025-09-11-15-24-21-59.jpg',
  'centre medical exterieur jour': 'https://i.ibb.co/tMqyxmCt/Image-2025-09-11-15-24-21-62.jpg',
  'centre medical exterieur nuit': 'https://i.ibb.co/v48GKb51/Image-2025-09-11-15-24-22-63.jpg',
  'laboratoire d\'oris interieur': 'https://i.ibb.co/DP5kgLCq/Image-2025-09-11-15-24-22-64.jpg',
  'laboratoire d\'oris exterieur jour': 'https://i.ibb.co/pBbx1gf2/Image-2025-09-11-15-24-22-125.jpg',
  'laboratoire d\'oris exterieur nuit': 'https://i.ibb.co/fYsz8kbQ/Image-2025-09-11-15-24-22-126.jpg',
  'chambre medical': 'https://i.ibb.co/kRyx0Xb/Image-2025-09-11-15-24-22-65.jpg',
  'chambre medical nuit': 'https://i.ibb.co/k2nFPLpn/Image-2025-09-11-15-24-22-66.jpg',

  // Zone Est
  'salle des jeux interieur': 'https://i.ibb.co/tM8vg2zn/Image-2025-09-11-15-24-22-75.jpg',
  'salle des jeux interieur VIP': 'https://i.ibb.co/qMWvVFV/Image-2025-09-11-15-24-22-76.jpg',
  'salle des jeux exterieur jour': 'https://i.ibb.co/hJDLW7wH/Image-2025-09-11-15-24-22-73.jpg',
  'salle des jeux exterieur nuit': 'https://i.ibb.co/vCkYch48/Image-2025-09-11-15-24-22-74.jpg',
  'residences nobles domicile jour': 'https://i.ibb.co/mV3Vkvh2/Image-2025-09-11-15-24-22-80.jpg',
  'residences nobles domicile nuit': 'https://i.ibb.co/1f1jdHWB/Image-2025-09-11-15-24-22-81.jpg',
  'residences nobles domicile chambre jour': 'https://i.ibb.co/Kx6FgY2t/Image-2025-09-11-15-24-22-82.jpg',
  'residences nobles domicile chambre nuit': 'https://i.ibb.co/gLXcbrQ8/Image-2025-09-11-15-24-22-83.jpg',
  'residences nobles domicile+': 'https://i.ibb.co/sd2mLHtN/Image-2025-09-11-15-24-22-79.jpg',
  'residences nobles jour': 'https://i.ibb.co/nsS5Jvzv/Image-2025-09-11-15-24-22-77.jpg',
  'residences nobles nuit': 'https://i.ibb.co/rfQs5dmd/Image-2025-09-11-15-24-22-78.jpg',
  'entree privee interieur jour': 'https://i.ibb.co/xPkQmzF/Image-2025-09-11-15-24-22-86.jpg',
  'entree privee interieur nuit': 'https://i.ibb.co/5gqPyLMh/Image-2025-09-11-15-24-22-87.jpg',
  'entree privee exterieur jour': 'https://i.ibb.co/dsTxxkPc/Image-2025-09-11-15-24-22-84.jpg',
  'entree privee exterieur nuit': 'https://i.ibb.co/2YfT4RFG/Image-2025-09-11-15-24-22-85.jpg',
  'nobles couture interieur jour': 'https://i.ibb.co/bj8Nrp9Z/Image-2025-09-11-15-24-22-88.jpg',
  'nobles couture interieur nuit': 'https://i.ibb.co/WpFDSrFM/Image-2025-09-11-15-24-22-89.jpg',
  'nobles couture exterieur jour': 'https://i.ibb.co/F4PPkmd7/Image-2025-09-11-15-24-22-90.jpg',
  'nobles couture exterieur nuit': 'https://i.ibb.co/zhXjXVQ9/Image-2025-09-11-15-24-22-91.jpg',

  // Zone Nord
  'cour d\'honneur exterieur jour': 'https://i.ibb.co/HTTWGsnJ/Image-2025-09-11-15-24-22-94.jpg',
  'cour d\'honneur exterieur nuit': 'https://i.ibb.co/1fN13Wsh/Image-2025-09-11-15-24-22-95.jpg',
  'cour d\'honneur interieur jour': 'https://i.ibb.co/sdgwbCDq/Image-2025-09-11-15-24-22-92.jpg',
  'cour d\'honneur interieur nuit': 'https://i.ibb.co/VpgNBH6K/Image-2025-09-11-15-24-22-93.jpg',
  'palais royal jour': 'https://i.ibb.co/3yJrNKL1/Image-2025-09-11-15-24-22-96.jpg',
 'palais royal nuit': 'https://i.ibb.co/pj623JPD/Image-2025-09-11-15-24-22-97.jpg',
  'palais royal trone jour': 'https://i.ibb.co/XxSQxW3D/Image-2025-09-11-15-24-22-98.jpg',
  'palais royal trone nuit': 'https://i.ibb.co/DdFrn72/Image-2025-09-11-15-24-22-99.jpg',
  'palais royal chambre jour': 'https://i.ibb.co/fzrqgQpg/Image-2025-09-11-15-24-22-100.jpg',
  'palais royal chambre nuit': 'https://i.ibb.co/bgZM7r0w/Image-2025-09-11-15-24-22-101.jpg',
  'palais royal salle de banquet': 'https://i.ibb.co/pBDVwsyT/Image-2025-09-11-15-24-22-102.jpg',
  'palais royal salle du conseil': 'https://i.ibb.co/LzKG3qTK/Image-2025-09-11-15-24-22-103.jpg',
  'palais royal jardin jour': 'https://i.ibb.co/zVbs6jxV/Image-2025-09-11-15-24-22-104.jpg',
  'palais royal jardin nuit': 'https://i.ibb.co/LhsQjbkj/Image-2025-09-11-15-24-22-105.jpg',
  'oubliettes couloir': 'https://i.ibb.co/rGy7wfRj/Image-2025-09-11-15-24-22-106.jpg',
  'oubliettes cellule': 'https://i.ibb.co/N2sC7vzr/Image-2025-09-11-15-24-22-107.jpg',
  'ecurie royale interieur jour': 'https://i.ibb.co/ZR0yVmdh/Image-2025-09-11-15-24-22-110.jpg',
  'ecurie royale interieur nuit': 'https://i.ibb.co/LhQWR2tp/Image-2025-09-11-15-24-22-111.jpg',
  'ecurie royale exterieur jour': 'https://i.ibb.co/8LYvGrJR/Image-2025-09-11-15-24-22-108.jpg',
  'ecurie royale exterieur nuit': 'https://i.ibb.co/SLnSQQW/Image-2025-09-11-15-24-22-109.jpg',
  'ecurie royale terrain entrainement jour': 'https://i.ibb.co/ch67MdfY/Image-2025-09-11-15-24-22-112.jpg',
  'ecurie royale terrain entrainement nuit': 'https://i.ibb.co/GQR2nDyC/Image-2025-09-11-15-24-22-113.jpg',
  'tour astral interieur jour': 'https://i.ibb.co/BHLdcnTN/Image-2025-09-11-15-24-22-116.jpg',
  'tour astral interieur nuit': 'https://i.ibb.co/fzCQqMdG/Image-2025-09-11-15-24-22-117.jpg',
  'tour astral exterieur jour': 'https://i.ibb.co/dJG6td2w/Image-2025-09-11-15-24-22-115.jpg',
  'tour astral exterieur nuit': 'https://i.ibb.co/KjQfV01f/Image-2025-09-11-15-24-22-114.jpg',
  'arsenal royal interieur': 'https://i.ibb.co/n83NZcxN/Image-2025-09-11-15-24-22-120.jpg',
  'arsenal royal exterieur jour': 'https://i.ibb.co/Q7BLF1h9/Image-2025-09-11-15-24-22-118.jpg',
  'arsenal royal exterieur nuit': 'https://i.ibb.co/WNQyYgzJ/Image-2025-09-11-15-24-22-119.jpg',
  'hall des gardiens interieur jour': 'https://i.ibb.co/hFWmwjNx/Image-2025-09-11-15-24-22-123.jpg',
  'hall des gardiens interieur nuit': 'https://i.ibb.co/5hTTGqhC/Image-2025-09-11-15-24-22-124.jpg',
  'hall des gardiens exterieur jour': 'https://i.ibb.co/SDn9c2fj/Image-2025-09-11-15-24-22-121.jpg',
  'hall des gardiens exterieur nuit': 'https://i.ibb.co/7FyTcK3/Image-2025-09-11-15-24-22-122.jpg',

  // origamy world
  'origamy world' : 'https://i.ibb.co/cKGZRtXX/20250911-193010.jpg',
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
