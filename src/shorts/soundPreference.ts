// Carries "sound on" from the Explore grid into the feed: if a preview had sound
// when the viewer opened a short, the feed starts unmuted too. One-shot — the
// feed takes it once on mount.

let soundOn = false;

export function carrySoundIntoFeed(on: boolean) {
  soundOn = on;
}

export function takeSoundIntoFeed(): boolean {
  const value = soundOn;
  soundOn = false;
  return value;
}
