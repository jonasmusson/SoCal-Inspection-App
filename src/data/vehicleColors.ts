export interface ColorOption {
  name: string;
  hex: string;
  textDark: boolean;
}

export const VEHICLE_COLORS: ColorOption[] = [
  { name: 'White',          hex: '#FFFFFF', textDark: true  },
  { name: 'Pearl White',    hex: '#F5F0E8', textDark: true  },
  { name: 'Silver',         hex: '#C0C0C0', textDark: true  },
  { name: 'Gray',           hex: '#808080', textDark: false },
  { name: 'Charcoal',       hex: '#4A4A4A', textDark: false },
  { name: 'Black',          hex: '#1A1A1A', textDark: false },
  { name: 'Red',            hex: '#CC2222', textDark: false },
  { name: 'Dark Red',       hex: '#8B0000', textDark: false },
  { name: 'Burgundy',       hex: '#800020', textDark: false },
  { name: 'Orange',         hex: '#E8601C', textDark: false },
  { name: 'Yellow',         hex: '#F5C518', textDark: true  },
  { name: 'Gold',           hex: '#C8961C', textDark: true  },
  { name: 'Beige / Tan',    hex: '#D2B48C', textDark: true  },
  { name: 'Brown',          hex: '#795548', textDark: false },
  { name: 'Champagne',      hex: '#F7E7CE', textDark: true  },
  { name: 'Cream / Ivory',  hex: '#FFFFF0', textDark: true  },
  { name: 'Light Blue',     hex: '#6BAED6', textDark: true  },
  { name: 'Blue',           hex: '#1565C0', textDark: false },
  { name: 'Dark Blue',      hex: '#0D2B6B', textDark: false },
  { name: 'Navy',           hex: '#001F5B', textDark: false },
  { name: 'Teal',           hex: '#008080', textDark: false },
  { name: 'Turquoise',      hex: '#40BCD8', textDark: true  },
  { name: 'Green',          hex: '#2E7D32', textDark: false },
  { name: 'Light Green',    hex: '#81C784', textDark: true  },
  { name: 'Olive',          hex: '#6B7C2D', textDark: false },
  { name: 'Purple',         hex: '#6A1B9A', textDark: false },
  { name: 'Pink',           hex: '#E91E8C', textDark: false },
  { name: 'Rose Gold',      hex: '#C9788A', textDark: false },
  { name: 'Bronze',         hex: '#8C5A2C', textDark: false },
  { name: 'Copper',         hex: '#B87333', textDark: true  },
  { name: 'Two-Tone',       hex: '#B0BEC5', textDark: true  },
  { name: 'Custom / Other', hex: '#E0E0E0', textDark: true  },
];
