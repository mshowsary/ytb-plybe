const subscriptions = new WeakMap();
export function subscribeWorld(world, listener, priority = 0) {
  let list = subscriptions.get(world);
  if (!list) { list = []; subscriptions.set(world, list); }
  const record = { listener, priority }; list.push(record); list.sort((a, b) => b.priority - a.priority);
  return () => { const index = list.indexOf(record); if (index >= 0) list.splice(index, 1); };
}
export function emitWorld(world, ...events) {
  for (const event of events) {
    for (const record of [...(subscriptions.get(world) || [])]) record.listener(event);
    world.events.push(event);
  }
  return world.events.length;
}
