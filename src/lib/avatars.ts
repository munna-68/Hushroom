// Character variants. The same list drives the avatar picker and the 3D builder.
export type HairStyle = 'bob' | 'short' | 'bun' | 'curly' | 'long' | 'spiky' | 'beanie';
export type TopStyle = 'hoodie' | 'sweater';
export type Accessory = 'none' | 'glasses' | 'headphones' | 'clip' | 'scarf';

export interface AvatarVariant {
  id: number;
  label: string;
  hair: HairStyle;
  hairColor: string;
  skin: string;
  top: TopStyle;
  topColor: string;
  trimColor: string;
  accessory: Accessory;
  accColor: string;
}

export const AVATARS: AvatarVariant[] = [
  { id: 0, label: 'Bob, mustard hoodie', hair: 'bob', hairColor: '#2b1d1a', skin: '#f6d2b5', top: 'hoodie', topColor: '#e3a948', trimColor: '#f7e7c6', accessory: 'headphones', accColor: '#3d7f86' },
  { id: 1, label: 'Curls, sage sweater', hair: 'curly', hairColor: '#3a2418', skin: '#9c6644', top: 'sweater', topColor: '#7fa38a', trimColor: '#e9e1cc', accessory: 'glasses', accColor: '#2a1c16' },
  { id: 2, label: 'Bun, rose hoodie', hair: 'bun', hairColor: '#5b3426', skin: '#ffdcc2', top: 'hoodie', topColor: '#d97a76', trimColor: '#fbe3d8', accessory: 'clip', accColor: '#f2b45a' },
  { id: 3, label: 'Short, navy sweater', hair: 'short', hairColor: '#1c1716', skin: '#c68c64', top: 'sweater', topColor: '#33507a', trimColor: '#d9c9a5', accessory: 'none', accColor: '#000000' },
  { id: 4, label: 'Long, lilac hoodie', hair: 'long', hairColor: '#20161a', skin: '#efc6a3', top: 'hoodie', topColor: '#9a86c4', trimColor: '#efe8f8', accessory: 'scarf', accColor: '#e7c76a' },
  { id: 5, label: 'Beanie, teal hoodie', hair: 'beanie', hairColor: '#4a2d20', skin: '#7a4b31', top: 'hoodie', topColor: '#2f8f8a', trimColor: '#d8efe7', accessory: 'none', accColor: '#e0673f' },
  { id: 6, label: 'Spiky, cream sweater', hair: 'spiky', hairColor: '#7a4a2a', skin: '#f3c9a8', top: 'sweater', topColor: '#e8dcc2', trimColor: '#b6584a', accessory: 'glasses', accColor: '#3a2a20' },
  { id: 7, label: 'Bob, plum sweater', hair: 'bob', hairColor: '#c76b3e', skin: '#fde3cf', top: 'sweater', topColor: '#6e3d5c', trimColor: '#f0c9a0', accessory: 'clip', accColor: '#7fd1c1' },
  { id: 8, label: 'Curls, coral hoodie', hair: 'curly', hairColor: '#120e10', skin: '#5e3a28', top: 'hoodie', topColor: '#e8835a', trimColor: '#fde7d4', accessory: 'headphones', accColor: '#f4efe4' },
  { id: 9, label: 'Short, forest hoodie', hair: 'short', hairColor: '#d7b37a', skin: '#ffe2cc', top: 'hoodie', topColor: '#3f6b4c', trimColor: '#e8e2c8', accessory: 'scarf', accColor: '#c94f4f' },
];

export function avatar(id: number): AvatarVariant {
  return AVATARS[((id % AVATARS.length) + AVATARS.length) % AVATARS.length];
}
