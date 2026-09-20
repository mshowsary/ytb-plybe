// The end-of-day numbers the summary card draws (ui/daySummary.js). Presentation-free: game.js
// builds this once in openDaySummary and hands the fields it needs to the card.
//
// The owner's rule after playing on a phone: never overwhelm or punish the player, only keep the
// game from being boring. So the card reports what the player GAINED — guests served, new pets met,
// photos taken — and the model carries no headline and no tip: the "A little more stock before the
// rush" sentence and the coral "n left" chip were a correction delivered at the exact moment
// nothing could be done about it (Batch D). Lost guests, misses and returns are still counted
// here, because the sim's other readers use them; nothing draws them.

const n = value => Math.max(0, Number(value) | 0);

// `n` folds every absent/garbage input to 0, which is the right answer for a service outcome (no
// misses recorded IS no misses). It is the wrong answer for the gain counters below, where 0 and
// "this shift never recorded it" are different facts, so those go through `known` instead.
// Number(null) === 0, so the null/undefined check has to come first.
const known = value => {
  if (value === null || value === undefined) return null;
  const v = Number(value);
  return Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : null;
};
// A running total now, less the reading taken when the shift began; unknown if either is. Clamped
// at 0: both totals only rise, so a negative means the readings came from different shifts.
const gain = (start, now) => (start === null || now === null ? null : Math.max(0, now - start));

export function buildServiceSummaryModel(dayStats = {}, meta = null) {
  const served = n(dayStats.served), lost = n(dayStats.lost), misses = n(dayStats.serviceMisses);
  const returns = n(dayStats.returnActions);
  const missedSeats = n(dayStats.missedSeats);
  const clean = lost === 0;

  // Null-when-unknown, not 0-when-unknown: src/sim/saveSchema.js rebuilds G.dayStats from a fixed
  // key whitelist, so a shift restored mid-day may carry none of these, and a chip that confidently
  // shows "0 photos" for a shift in which the player did take photos is a lie the card cannot take
  // back. Unknown draws nothing at all.
  const photos = known(dayStats.photos);
  const followers = gain(known(dayStats.followersStart), meta ? known(meta.followers) : null);
  // New pets met today: meta.petDiscoveries against the reading game.js takes at the start of the
  // shift (dayStats.petsStart, Batch D wiring).
  const newPets = gain(known(dayStats.petsStart), meta ? known(meta.petDiscoveries) : null);

  return { served, lost, misses, missedSeats, returns, photos, followers, newPets, clean };
}
