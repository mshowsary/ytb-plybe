// Menu-book portraits use the same canonical coat, muzzle and collar colors as visiting pets.
export function petPortrait(species, profile) {
  const safe = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#D9A066';
  const body=safe(profile.body), belly=safe(profile.belly), accent=safe(profile.accent);
  const ears = species === 'bunny'
    ? `<ellipse cx="28" cy="23" rx="8" ry="21" fill="${body}" transform="rotate(-12 28 23)"/><ellipse cx="53" cy="23" rx="8" ry="21" fill="${body}" transform="rotate(12 53 23)"/><ellipse cx="28" cy="23" rx="3" ry="14" fill="#F5B2BE"/><ellipse cx="53" cy="23" rx="3" ry="14" fill="#F5B2BE"/>`
    : species === 'dog'
    ? `<ellipse cx="17" cy="43" rx="11" ry="21" fill="${accent}" transform="rotate(16 17 43)"/><ellipse cx="63" cy="43" rx="11" ry="21" fill="${accent}" transform="rotate(-16 63 43)"/>`
    : `<path d="M16 39L14 12L37 28M43 28L66 12L64 39" fill="${body}"/><path d="M20 30L19 20L29 28M51 28L61 20L60 30" fill="#F5B2BE"/>`;
  const whiskers=species==='cat'?'<path d="M20 50L9 47M20 55L8 56M60 50L71 47M60 55L72 56" stroke="#6B4A3C" stroke-width="1.4" stroke-linecap="round"/>':'';
  return `<svg viewBox="0 0 80 88" aria-hidden="true" focusable="false"><circle cx="40" cy="45" r="36" fill="#F8E7D1"/>${ears}<ellipse cx="40" cy="47" rx="26" ry="25" fill="${body}"/><ellipse cx="40" cy="57" rx="16" ry="12" fill="${belly}"/><ellipse cx="29" cy="45" rx="3" ry="4" fill="#382B27"/><ellipse cx="51" cy="45" rx="3" ry="4" fill="#382B27"/><circle cx="30" cy="44" r="1" fill="white"/><circle cx="52" cy="44" r="1" fill="white"/><path d="M36 54Q40 51 44 54L40 58Z" fill="#805044"/><path d="M40 58V61M40 61Q35 65 32 60M40 61Q45 65 48 60" fill="none" stroke="#805044" stroke-width="1.5" stroke-linecap="round"/>${whiskers}<rect x="23" y="70" width="34" height="6" rx="3" fill="${accent}"/><circle cx="40" cy="77" r="5" fill="#E8B952"/><path d="M38 77h4M40 75v4" stroke="#FFF4D1" stroke-width="1.2"/></svg>`;
}
