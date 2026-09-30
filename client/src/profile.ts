import { randomIdentity, sanitizeLook, sanitizeName, type Look } from '@sp/shared';

export interface Profile {
  name: string;
  look: Look;
}

const KEY = 'sp.profile';

/** The player's saved name + outfit. First visit gets a random silly identity. */
export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      return { name: sanitizeName(p.name, 'Player'), look: sanitizeLook(p.look) };
    }
  } catch {
    /* storage blocked or corrupt */
  }
  const id = randomIdentity(Math.floor(Math.random() * 1e9));
  const p = { name: id.name, look: id.look };
  saveProfile(p);
  return p;
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}
