// A bounded, additive performance. No world position, simulation RNG or gameplay state changes.
export function petSocialPose(species, variant, progress, activity = 'greet') {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const e = Math.sin(p * Math.PI) ** 2;
  const style = (Math.abs(variant | 0) % 5) / 4;
  const nibble = activity === 'eat';
  if (species === 'dog') return { tilt: Math.sin(p * Math.PI * 2) * (.16 + style * .1) * e, nod: (nibble ? .18 : -.08) * e, wag: Math.sin(p * Math.PI * 10) * .75 * e, squash: .025 * e };
  if (species === 'cat') return { tilt: -.12 * e, nod: (nibble ? .24 : -.15) * e, wag: Math.sin(p * Math.PI * 2) * .22 * e, squash: -.035 * e };
  if (species === 'bunny') return { tilt: Math.sin(p * Math.PI * 3) * .12 * e, nod: Math.sin(p * Math.PI * (nibble ? 8 : 3)) * .15 * e, wag: .12 * e, squash: .05 * e };
  return { tilt: Math.sin(p * Math.PI * 2) * .1 * e, nod: (.1 + Math.sin(p * Math.PI * 12) * .12) * e, wag: 0, squash: .04 * e };
}
