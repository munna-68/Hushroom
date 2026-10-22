// Character specs. The same list drives the avatar picker and the 3D builder.
// Palettes are sampled from the swatch rows of docs/character-sheet.png.

export const SKIN = ['#f1c6a5', '#e2b18f', '#d59f7d', '#c68a65', '#b87c57', '#a56c52', '#6e4430', '#482e24'];
export const HAIR = ['#4a3329', '#51362a', '#754934', '#946140', '#d9b38e', '#a68169', '#3b424f', '#c0624b'];
export const OUTFIT = ['#ebd4b9', '#798475', '#456360', '#3f4e44', '#b76548', '#c87966', '#617b92', '#6a495d'];
/** Trousers, sampled from the sheet's figures (denim, charcoal, beige, plum, navy). */
export const PANTS = ['#55627a', '#49454b', '#d8c7a8', '#64434e', '#3f4a5c'];

export type HairStyle = 'crop' | 'swept' | 'bob' | 'ponytail' | 'bun' | 'curly';
export type Outfit = 'hoodie' | 'sweater' | 'cardigan' | 'track' | 'sweatshirt' | 'vest';
export type Accessory = 'glasses' | 'headphones' | 'beanie' | 'clips' | 'scarf' | 'backpack';
export type Expression = 'focused' | 'smile' | 'sleepy' | 'blink' | 'surprised' | 'annoyed' | 'exhausted' | 'determined';

export const HAIR_STYLES: HairStyle[] = ['crop', 'swept', 'bob', 'ponytail', 'bun', 'curly'];
export const OUTFITS: Outfit[] = ['hoodie', 'sweater', 'cardigan', 'track', 'sweatshirt', 'vest'];
export const ACCESSORIES: Accessory[] = ['glasses', 'headphones', 'beanie', 'clips', 'scarf', 'backpack'];
export const EXPRESSIONS: Expression[] = ['focused', 'smile', 'sleepy', 'blink', 'surprised', 'annoyed', 'exhausted', 'determined'];

export interface CharacterSpec {
  hair: HairStyle;
  hairColor: number; // index into HAIR
  skin: number; // index into SKIN
  outfit: Outfit;
  outfitColor: number; // index into OUTFIT
  pants: number; // index into PANTS
  accessories: Accessory[];
  /** Resting focus face; status drives the rest. */
  expression: Expression;
}

export interface AvatarVariant {
  id: number;
  label: string;
  spec: CharacterSpec;
}

const S = (hair: HairStyle, hairColor: number, skin: number, outfit: Outfit, outfitColor: number, pants: number, accessories: Accessory[], expression: Expression = 'focused'): CharacterSpec =>
  ({ hair, hairColor, skin, outfit, outfitColor, pants, accessories, expression });

export const AVATARS: AvatarVariant[] = [
  { id: 0, label: 'Short crop, sage hoodie', spec: S('crop', 0, 1, 'hoodie', 1, 0, []) },
  { id: 1, label: 'Curls, glasses and backpack', spec: S('curly', 0, 6, 'hoodie', 1, 0, ['glasses', 'backpack'], 'determined') },
  { id: 2, label: 'Low ponytail, rust cardigan', spec: S('ponytail', 2, 0, 'cardigan', 4, 1, ['headphones']) },
  { id: 3, label: 'Curls in a beanie, track jacket', spec: S('curly', 1, 7, 'track', 2, 3, ['beanie'], 'determined') },
  { id: 4, label: 'Bob, cream sweater', spec: S('bob', 1, 2, 'sweater', 0, 4, ['clips']) },
  { id: 5, label: 'Bun, blue sweatshirt', spec: S('bun', 0, 3, 'sweatshirt', 6, 2, ['scarf']) },
  { id: 6, label: 'Side swept, puffer vest', spec: S('swept', 3, 1, 'vest', 3, 1, ['headphones'], 'determined') },
  { id: 7, label: 'Ginger bob, plum cardigan', spec: S('bob', 7, 0, 'cardigan', 7, 2, ['glasses']) },
  { id: 8, label: 'Side swept, rose sweater', spec: S('swept', 6, 5, 'sweater', 5, 0, ['scarf']) },
  { id: 9, label: 'Blond crop, teal track jacket', spec: S('crop', 4, 4, 'track', 3, 1, ['backpack'], 'determined') },
];

/** Deterministic: the same avatar id always maps to the same character. */
export function avatar(id: number): AvatarVariant {
  return AVATARS[((id % AVATARS.length) + AVATARS.length) % AVATARS.length];
}
