import { petAppearance } from '../render/petAppearance.js';

// Menu-book portraits use the same canonical coat and authored silhouette as visiting pets.
export function petPortrait(species, profile, variant = 0) {
  const safe = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#D9A066';
  const body=safe(profile.body), belly=safe(profile.belly), accent=safe(profile.accent);
  const look = petAppearance(species, variant);
  const patch = safe(look.patch || accent);
  const faceRx = Math.round(26 * Math.max(.92, Math.min(1.1, (look.width || 1) * (look.head || 1))));
  const faceRy = Math.round(25 * Math.max(.94, Math.min(1.1, look.height || 1)));
  const ears = species === 'hamster'
    ? `<circle cx="25" cy="27" r="12" fill="${body}"/><circle cx="55" cy="27" r="12" fill="${body}"/><circle cx="25" cy="27" r="6" fill="#F5B2BE"/><circle cx="55" cy="27" r="6" fill="#F5B2BE"/>`
    : species === 'bunny'
    ? look.ears === 'lop'
      ? `<ellipse cx="18" cy="35" rx="8" ry="21" fill="${body}" transform="rotate(48 18 35)"/><ellipse cx="62" cy="35" rx="8" ry="21" fill="${body}" transform="rotate(-48 62 35)"/><ellipse cx="18" cy="35" rx="3" ry="14" fill="#F5B2BE" transform="rotate(48 18 35)"/><ellipse cx="62" cy="35" rx="3" ry="14" fill="#F5B2BE" transform="rotate(-48 62 35)"/>`
      : `<ellipse cx="28" cy="23" rx="8" ry="21" fill="${body}" transform="rotate(-12 28 23)"/><ellipse cx="53" cy="23" rx="8" ry="21" fill="${body}" transform="rotate(${look.ears === 'split' ? -42 : 12} 53 23)"/><ellipse cx="28" cy="23" rx="3" ry="14" fill="#F5B2BE"/><ellipse cx="53" cy="23" rx="3" ry="14" fill="#F5B2BE"/>`
    : species === 'dog'
    ? look.ears === 'upright'
      ? `<path d="M15 38L18 8L35 32M45 32L62 8L65 38" fill="${accent}"/>`
      : `<ellipse cx="17" cy="43" rx="${look.ears === 'round' ? 13 : 11}" ry="${look.ears === 'round' ? 15 : 21}" fill="${accent}" transform="rotate(16 17 43)"/><ellipse cx="63" cy="43" rx="${look.ears === 'round' ? 13 : 11}" ry="${look.ears === 'round' ? 15 : 21}" fill="${accent}" transform="rotate(-16 63 43)"/>`
    : `<path d="M16 39L14 12L37 28M43 28L66 12L64 39" fill="${body}"/><path d="M20 30L19 20L29 28M51 28L61 20L60 30" fill="#F5B2BE"/>`;
  const whiskers=species==='cat'?'<path d="M20 50L9 47M20 55L8 56M60 50L71 47M60 55L72 56" stroke="#6B4A3C" stroke-width="1.4" stroke-linecap="round"/>':'';
  const marking = look.pattern === 'blaze' || look.pattern === 'tuxedo'
    ? `<path d="M34 25Q40 19 46 25L44 47Q40 52 36 47Z" fill="${patch}" opacity=".94"/>`
    : look.pattern === 'mask'
      ? `<ellipse cx="29" cy="39" rx="12" ry="13" fill="${patch}" opacity=".9"/>`
      : look.pattern === 'calico' || look.pattern === 'saddle' || look.pattern === 'cloud'
        ? `<ellipse cx="27" cy="34" rx="13" ry="10" fill="${patch}" opacity=".92"/>`
        : look.pattern === 'tabby' || look.pattern === 'constellation'
          ? `<path d="M30 25l3 13M40 23v15M50 25l-3 13" stroke="${patch}" stroke-width="3" stroke-linecap="round" opacity=".78"/>`
          : '';
  return `<svg viewBox="0 0 80 88" aria-hidden="true" focusable="false"><circle cx="40" cy="45" r="36" fill="#F8E7D1"/>${ears}<ellipse cx="40" cy="47" rx="${faceRx}" ry="${faceRy}" fill="${body}"/>${marking}<ellipse cx="40" cy="57" rx="16" ry="12" fill="${belly}"/><ellipse cx="29" cy="45" rx="3" ry="4" fill="#382B27"/><ellipse cx="51" cy="45" rx="3" ry="4" fill="#382B27"/><circle cx="30" cy="44" r="1" fill="white"/><circle cx="52" cy="44" r="1" fill="white"/><path d="M36 54Q40 51 44 54L40 58Z" fill="#805044"/><path d="M40 58V61M40 61Q35 65 32 60M40 61Q45 65 48 60" fill="none" stroke="#805044" stroke-width="1.5" stroke-linecap="round"/>${whiskers}<rect x="23" y="70" width="34" height="6" rx="3" fill="${accent}"/><circle cx="40" cy="77" r="5" fill="#E8B952"/><path d="M38 77h4M40 75v4" stroke="#FFF4D1" stroke-width="1.2"/></svg>`;
}
