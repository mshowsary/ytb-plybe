// Pause-aware presentation timing for UI/FX callbacks that must not age while gameplay is paused.
// Host and user pause reasons are independent: work resumes only after every active reason clears.
export function createPresentationScheduler(env = {}) {
  const now = typeof env.now === 'function' ? env.now : () => performance.now();
  const setTimer = typeof env.setTimer === 'function' ? env.setTimer : (fn, ms) => setTimeout(fn, ms);
  const clearTimer = typeof env.clearTimer === 'function' ? env.clearTimer : id => clearTimeout(id);
  const requestFrame = typeof env.requestFrame === 'function' ? env.requestFrame : fn => requestAnimationFrame(fn);
  const cancelFrame = typeof env.cancelFrame === 'function' ? env.cancelFrame : id => cancelAnimationFrame(id);
  const listAnimations = typeof env.listAnimations === 'function'
    ? env.listAnimations
    : () => (typeof document !== 'undefined' && typeof document.getAnimations === 'function' ? document.getAnimations() : []);

  let nextId = 1;
  const reasons = new Set();
  const timers = new Map();
  const frames = new Map();
  const resumeWaiters = new Set();
  const pausedAnimations = new Set();

  const paused = () => reasons.size > 0;

  function armTimer(task) {
    if (paused() || task.cancelled) return;
    task.startedAt = now();
    task.nativeId = setTimer(() => {
      task.nativeId = null;
      timers.delete(task.id);
      if (!task.cancelled) task.fn();
    }, Math.max(0, task.remaining));
  }

  function armFrame(task) {
    if (paused() || task.cancelled || task.nativeId != null) return;
    task.nativeId = requestFrame(() => {
      task.nativeId = null;
      if (task.cancelled) return;
      if (paused()) return;
      task.remainingFrames--;
      if (task.remainingFrames <= 0) {
        frames.delete(task.id);
        task.fn();
      } else armFrame(task);
    });
  }

  function pauseAnimations() {
    let animations = [];
    try { animations = listAnimations() || []; } catch (_) { animations = []; }
    for (const animation of animations) {
      if (!animation || typeof animation.pause !== 'function') continue;
      const state = animation.playState;
      if (state !== 'running' && state !== 'pending') continue;
      try {
        animation.pause();
        pausedAnimations.add(animation);
      } catch (_) {}
    }
  }

  function resumeAnimations() {
    for (const animation of pausedAnimations) {
      if (!animation || typeof animation.play !== 'function') continue;
      // Finished/cancelled transitions should not be resurrected. A transition paused by us should
      // normally still report paused; only resume that state so externally-paused animations stay so.
      if (animation.playState !== 'paused') continue;
      try { animation.play(); } catch (_) {}
    }
    pausedAnimations.clear();
  }

  function pauseAll() {
    const stamp = now();
    for (const task of timers.values()) {
      if (task.nativeId == null) continue;
      clearTimer(task.nativeId);
      task.nativeId = null;
      task.remaining = Math.max(0, task.remaining - (stamp - task.startedAt));
    }
    for (const task of frames.values()) {
      if (task.nativeId == null) continue;
      cancelFrame(task.nativeId);
      task.nativeId = null;
    }
    pauseAnimations();
  }

  function resumeAll() {
    resumeAnimations();
    for (const task of timers.values()) armTimer(task);
    for (const task of frames.values()) armFrame(task);
    for (const resolve of resumeWaiters) resolve();
    resumeWaiters.clear();
  }

  const S = {
    get paused() { return paused(); },
    get pauseReasons() { return new Set(reasons); },

    setPaused(reason, value) {
      const key = String(reason || 'unknown');
      const wasPaused = paused();
      if (value) reasons.add(key); else reasons.delete(key);
      const isPaused = paused();
      if (!wasPaused && isPaused) pauseAll();
      else if (wasPaused && !isPaused) resumeAll();
      return isPaused;
    },

    schedule(fn, ms = 0) {
      if (typeof fn !== 'function') return null;
      const task = { id: nextId++, fn, remaining: Math.max(0, Number(ms) || 0), startedAt: 0, nativeId: null, cancelled: false };
      timers.set(task.id, task);
      armTimer(task);
      return task.id;
    },

    cancel(id) {
      const timer = timers.get(id);
      if (timer) {
        timer.cancelled = true;
        if (timer.nativeId != null) clearTimer(timer.nativeId);
        timers.delete(id);
        return true;
      }
      const frame = frames.get(id);
      if (frame) {
        frame.cancelled = true;
        if (frame.nativeId != null) cancelFrame(frame.nativeId);
        frames.delete(id);
        return true;
      }
      return false;
    },

    afterFrames(fn, count = 1) {
      if (typeof fn !== 'function') return null;
      const task = { id: nextId++, fn, remainingFrames: Math.max(1, count | 0), nativeId: null, cancelled: false };
      frames.set(task.id, task);
      armFrame(task);
      return task.id;
    },

    whenResumed() {
      if (!paused()) return Promise.resolve();
      return new Promise(resolve => resumeWaiters.add(resolve));
    },

    clear() {
      const wasPaused = paused();
      for (const id of [...timers.keys()]) S.cancel(id);
      for (const id of [...frames.keys()]) S.cancel(id);
      reasons.clear();
      if (wasPaused) resumeAnimations();
      for (const resolve of resumeWaiters) resolve();
      resumeWaiters.clear();
    },
  };

  return S;
}

// Pet Café is a single-runtime SPA. A singleton keeps presentation owners decoupled from game-state
// serialization while still sharing the same host/user pause reasons.
export const presentationScheduler = createPresentationScheduler();
