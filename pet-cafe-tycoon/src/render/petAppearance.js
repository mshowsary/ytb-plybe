// Render-only identity metadata. Array order follows sim/petBook.js and therefore does not create
// new save keys or consume simulation randomness.
const LOOKS = Object.freeze({
  cat: Object.freeze([
    { size: .96, width: 1.02, height: .98, length: 1.02, head: 1.04, pattern: 'tabby', patch: '#B97636' },
    { size: .91, width: .94, height: 1.04, length: .96, head: 1.06, pattern: 'tuxedo', patch: '#FFF4E6' },
    { size: 1.02, width: .94, height: 1.10, length: 1.04, head: .98, pattern: 'mask', patch: '#EEE2FF' },
    { size: 1.05, width: 1.06, height: 1.02, length: .98, head: 1.08, pattern: 'calico', patch: '#B76542' },
    { size: .99, width: .98, height: 1.08, length: 1.08, head: 1.02, pattern: 'constellation', patch: '#8B7CF6' },
  ]),
  dog: Object.freeze([
    { size: .96, width: 1.02, height: .88, length: 1.05, head: 1.04, ears: 'flop', pattern: 'saddle', patch: '#9B6D46' },
    { size: .88, width: 1.08, height: .84, length: .92, head: 1.12, ears: 'flop', pattern: 'mask', patch: '#4E342C' },
    { size: 1.08, width: 1.12, height: 1.10, length: 1.02, head: 1.12, ears: 'round', pattern: 'cloud', patch: '#FFF9F1' },
    { size: 1.12, width: .92, height: 1.18, length: 1.08, head: .96, ears: 'upright', pattern: 'blaze', patch: '#EAF4FF' },
    { size: 1.03, width: 1.04, height: 1.04, length: 1.05, head: 1.04, ears: 'upright', pattern: 'constellation', patch: '#A799E8' },
  ]),
  bunny: Object.freeze([
    { size: .95, width: 1.02, height: 1.04, length: .96, head: 1.02, ears: 'upright', pattern: 'nose', patch: '#D8C8B8' },
    { size: .88, width: 1.08, height: .96, length: .92, head: 1.08, ears: 'lop', pattern: 'mask', patch: '#B8A48C' },
    { size: 1.02, width: .94, height: 1.10, length: 1.02, head: .98, ears: 'upright', pattern: 'blaze', patch: '#F2E6FF' },
    { size: 1.06, width: 1.08, height: 1.02, length: 1.04, head: 1.06, ears: 'split', pattern: 'saddle', patch: '#B88363' },
    { size: 1.00, width: 1.00, height: 1.08, length: 1.02, head: 1.02, ears: 'upright', pattern: 'constellation', patch: '#8B7CF6' },
  ]),
  hamster: Object.freeze([
    { size: 1.04, width: 1.08, height: .96, length: 1.02, head: 1.08, pattern: 'saddle', patch: '#A96F36' },
    { size: .92, width: 1.02, height: .94, length: .94, head: 1.06, pattern: 'tuxedo', patch: '#FFF4E6' },
    { size: 1.10, width: 1.12, height: 1.08, length: 1.06, head: 1.10, pattern: 'cloud', patch: '#FFF9F1' },
    { size: .98, width: .96, height: 1.04, length: .98, head: 1.00, pattern: 'blaze', patch: '#F4C96D' },
    { size: 1.06, width: 1.08, height: 1.04, length: 1.02, head: 1.08, pattern: 'constellation', patch: '#A799E8' },
  ]),
});

const FALLBACK = Object.freeze({ size: 1, width: 1, height: 1, length: 1, head: 1, pattern: 'solid', patch: '#FFF4E6' });

export function petAppearance(species, variant = 0) {
  const set = LOOKS[species] || LOOKS.cat;
  return set[Math.max(0, Math.min(set.length - 1, variant | 0))] || FALLBACK;
}

export function petAppearanceCount() {
  return Object.values(LOOKS).reduce((sum, set) => sum + set.length, 0);
}
