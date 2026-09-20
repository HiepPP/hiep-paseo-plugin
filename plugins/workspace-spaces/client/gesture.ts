// A quiet gap ends a trackpad gesture; momentum must not skip multiple Spaces.
export function createWheelGesture() {
  let last = -Infinity,
    x = 0,
    y = 0,
    fired = false;
  return (dx: number, dy: number, time: number) => {
    if (time - last > 220) {
      x = 0;
      y = 0;
      fired = false;
    }
    last = time;
    x += dx;
    y += Math.abs(dy);
    if (fired || Math.abs(x) < 70 || Math.abs(x) < y * 1.5) return 0;
    fired = true;
    return x > 0 ? 1 : -1;
  };
}
export function touchDirection(dx: number, dy: number) {
  return Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0;
}
