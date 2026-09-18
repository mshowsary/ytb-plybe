// Coalesces material progression changes into one coherent post-update save request.
// Systems mark intent while mutating; game.js owns the single flush boundary after event fan-out.
export function createMaterialCheckpoint(platform, snapshot) {
  let dirty = false;
  const reasons = new Set();

  return {
    get dirty() { return dirty; },
    get reasons() { return Array.from(reasons); },

    mark(reason = 'material') {
      dirty = true;
      reasons.add(String(reason || 'material'));
    },

    reset() {
      dirty = false;
      reasons.clear();
    },

    flush() {
      if (!dirty) return false;
      if (!platform || typeof platform.save !== 'function' || typeof snapshot !== 'function') {
        this.reset();
        return false;
      }

      let data;
      try { data = snapshot(); }
      catch (_) { return false; }

      // Clear before dispatch: the platform save queue owns transport retries (Task 06), while any
      // material mutation that occurs after this snapshot can independently dirty the next frame.
      this.reset();
      try {
        Promise.resolve(platform.save(data)).catch(() => false);
      } catch (_) {}
      return true;
    },
  };
}

// Continuous stand-to-build payments must not become a save request every rendered frame.
// Save the first contribution, each quarter boundary, and completion. zones.js also checkpoints
// wallet exhaustion and the final unsaved partial amount when the payment stream stops.
export function crossedBuildPaymentMilestone(lastCheckpointPaid, currentPaid, price) {
  const total = Number(price);
  if (!Number.isFinite(total) || total <= 0) return false;
  const before = Math.max(0, Math.min(total, Number(lastCheckpointPaid) || 0));
  const after = Math.max(0, Math.min(total, Number(currentPaid) || 0));
  if (after <= before) return false;
  if (before === 0 || after >= total) return true;
  const bucket = value => Math.floor(Math.min(0.999999, value / total) * 4);
  return bucket(after) > bucket(before);
}
