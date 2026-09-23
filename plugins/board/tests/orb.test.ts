import assert from "node:assert/strict";
import test from "node:test";
import { isDarkSurface, orbPreset, sphereCanvas } from "../shared/orb";

test("reads dark and light surfaces from hex and rgb colors", () => {
  assert.equal(isDarkSurface("#141416"), true);
  assert.equal(isDarkSurface("#fff"), false);
  assert.equal(isDarkSurface("#F6F6F7"), false);
  assert.equal(isDarkSurface("rgb(28, 28, 31)"), true);
  assert.equal(isDarkSurface("rgba(250, 250, 250, 1)"), false);
});

test("treats unparseable surfaces as dark", () => {
  assert.equal(isDarkSurface("hsl(0, 0%, 100%)"), true);
  assert.equal(isDarkSurface(""), true);
});

test("picks the nearest tuned orb preset and the scale to reach the target size", () => {
  assert.deepEqual(orbPreset(36), { size: 32, scale: 36 / 32 });
  assert.deepEqual(orbPreset(12), { size: 20, scale: 12 / 20 });
  assert.deepEqual(orbPreset(72), { size: 64, scale: 72 / 64 });
  assert.equal(orbPreset(26).size, 20);
  assert.equal(orbPreset(50).size, 64);
});

test("sizes the solving orb so its sphere silhouette matches a given diameter", () => {
  assert.ok(Math.abs(sphereCanvas(41) - 50) < 1e-9);
  assert.ok(Math.abs(sphereCanvas(36) * 0.82 - 36) < 1e-9);
});
