// Locks and unlocks Vault passwords and API keys in the browser.
// The passphrase is turned into an AES-GCM key with PBKDF2; only the scrambled text is saved.
// The key can't be read back out (non-extractable) and only lives in memory while unlocked.

export const VAULT_ITERATIONS = 600_000;
export const PASSPHRASE_MIN = 12;
const CHECK_WORD = "vault-ok";

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export function newSalt() {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(passphrase: string, salt: string, iterations: number) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// context ties a value to its entry and field, so scrambled text can't be swapped between them.
export async function encrypt(key: CryptoKey, text: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(text),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(data))}`;
}

export async function decrypt(key: CryptoKey, stored: string, context: string) {
  const [iv, data] = stored.split(".");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv), additionalData: new TextEncoder().encode(context) },
    key,
    fromBase64(data),
  );
  return new TextDecoder().decode(plain);
}

export const makeCheckValue = (key: CryptoKey) => encrypt(key, CHECK_WORD, "check");

// A wrong passphrase gives a different key, which can't open the check value.
export async function isRightKey(key: CryptoKey, checkValue: string) {
  try {
    return (await decrypt(key, checkValue, "check")) === CHECK_WORD;
  } catch {
    return false;
  }
}

// Five random everyday words, like "river-candle-tiger-maple-orbit": easy to remember, hard to guess.
const WORDS = (
  "acorn actor amber anchor angle apple apron arrow atlas autumn bacon badge bagel baker bamboo banjo barrel " +
  "basket beacon beaver bench berry bison blanket blossom border bottle breeze brick bridge bronze bubble bucket " +
  "buffalo bundle butter button cabin cactus camel camera candle canoe canyon carpet carrot castle cedar cello " +
  "chalk cherry chess chimney cinema circus citrus clover cobalt coconut comet copper coral cotton coyote crayon " +
  "cricket crystal cupcake curtain daisy dancer delta denim desert diamond dolphin donkey dragon drum eagle " +
  "echo eclipse elbow ember engine falcon feather fern fiddle field flute forest fossil fountain fox galaxy " +
  "garden garlic gecko geyser ginger glacier globe goblet granite grape guitar hammer harbor harvest hazel " +
  "helmet heron honey horizon husky igloo island ivory jacket jaguar jasmine jelly jigsaw jungle kayak kettle " +
  "kitten koala ladder lagoon lantern lemon lily lizard lobster locket lotus lunar magnet mango maple marble " +
  "meadow melon meteor mint mirror mitten monsoon mosaic muffin museum nectar needle nickel noodle nutmeg oasis " +
  "ocean olive onion opera orbit orchid otter oyster paddle panda papaya parrot peanut pebble pelican pepper " +
  "piano pickle pigeon pillow pirate planet plum pocket polar pony poppy potato prism puffin pumpkin puzzle " +
  "quartz quill rabbit radar radish rainbow raven ribbon river robin rocket saddle saffron salmon sandal " +
  "satin scarf shadow sherbet silver sketch sled slipper snail sparrow spider spinach spoon squash squirrel " +
  "stamp starfish summit sunset swan tablet tango teapot thistle thunder tiger timber toast tomato topaz " +
  "torch tractor trumpet tulip tundra turnip turtle umbrella valley velvet violin voyage waffle walnut " +
  "walrus wander wasabi whistle willow window wizard yogurt zebra zephyr zipper"
).split(" ");

export function suggestPassphrase(count = 5) {
  const picks = crypto.getRandomValues(new Uint32Array(count));
  return Array.from(picks, (n) => WORDS[n % WORDS.length]).join("-");
}
