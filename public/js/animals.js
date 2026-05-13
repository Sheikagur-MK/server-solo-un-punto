// ── CONFIGURACIÓN DE PERSONAJES Y SKINS ──────────────────────────────────────

// 1. Base de Datos de Animales (Estadísticas visuales y descripciones)
const ANIMALS_DATA = {
  leon: { 
    name: 'León',     
    emoji: '🦁', 
    color: '#F4A460', 
    desc: 'El rey de la sabana. Poderoso y equilibrado.' 
  },
  gorila: { 
    name: 'Gorila',   
    emoji: '🦍', 
    color: '#708090', 
    desc: 'Fuerza bruta y gran inteligencia para los retos.' 
  },
  oso: { 
    name: 'Oso',      
    emoji: '🐻', 
    color: '#8B4513', 
    desc: 'Resistente y siempre listo para la aventura.' 
  },
  pinguino: { 
    name: 'Pingüino', 
    emoji: '🐧', 
    color: '#2F4F4F', 
    desc: 'Pequeño, rápido y experto en minijuegos de hielo.' 
  },
  tiburon: { 
    name: 'Tiburón',  
    emoji: '🦈', 
    color: '#5F9EA0', 
    desc: 'El depredador más veloz del tablero marino.' 
  },
  zorro: { 
    name: 'Zorro',    
    emoji: '🦊', 
    color: '#FF8C00', 
    desc: 'Astuto y veloz, ideal para esquivar peligros.' 
  },
  rana: { 
    name: 'Rana',     
    emoji: '🐸', 
    color: '#32CD32', 
    desc: 'Gran capacidad de salto en casillas especiales.' 
  },
  elefante: { 
    name: 'Elefante', 
    emoji: '🐘', 
    color: '#A9A9A9', 
    desc: 'Imparable y con una memoria legendaria.' 
  }
};

// 2. Catálogo de Skins (Tienda y Personalización)
const SKINS_CATALOG = [
  { 
    id: 'default',   
    name: 'Original',     
    emoji: '⚪', 
    price: 0,   
    desc: 'El aspecto clásico de tu animal.' 
  },
  { 
    id: 'golden',    
    name: 'Dorado',       
    emoji: '🌟', 
    price: 500, 
    desc: 'Brilla como el oro puro en el tablero.' 
  },
  { 
    id: 'neon',      
    name: 'Cyber Neon',   
    emoji: '💜', 
    price: 350, 
    desc: 'Resplandece con luces led en la oscuridad.' 
  },
  { 
    id: 'pixel',     
    name: 'Retro 8-Bit',  
    emoji: '👾', 
    price: 200, 
    desc: 'Un estilo clásico de consola antigua.' 
  },
  { 
    id: 'fire',      
    name: 'Fuego Vivo',   
    emoji: '🔥', 
    price: 400, 
    desc: 'Efectos de llamas al caminar por las casillas.' 
  },
  { 
    id: 'ice',       
    name: 'Cero Grados',  
    emoji: '❄️', 
    price: 300, 
    desc: 'Frío como el ártico, deja un rastro de escarcha.' 
  },
  { 
    id: 'galaxy',    
    name: 'Galáctico',    
    emoji: '🌌', 
    price: 600, 
    desc: 'Contiene el misterio del universo entero.' 
  }
];

// 3. Helper para obtener los datos completos de un jugador
const getPlayerData = (animalKey, skinId) => {
  const base = ANIMALS_DATA[animalKey] || ANIMALS_DATA.leon;
  const skin = SKINS_CATALOG.find(s => s.id === skinId) || SKINS_CATALOG[0];
  
  return {
    ...base,
    activeSkin: skin.id,
    displayEmoji: skinId === 'default' ? base.emoji : skin.emoji
  };
};

// Exportar para Node.js si es necesario, o dejar global para el navegador
if (typeof module !== 'undefined') {
  module.exports = { ANIMALS_DATA, SKINS_CATALOG };
}
