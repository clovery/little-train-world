import test from 'node:test';
import assert from 'node:assert/strict';
import { coachStyles, consistSpacing } from '../src/game/trainConsist.ts';

test('every train style has at least two matching coaches', () => {
  for (const [train, style] of Object.entries(coachStyles)) {
    assert.ok(style.count >= 2, `${train} should pull multiple coaches`);
    assert.ok(style.roof === 'round' || style.roof === 'flat' || style.roof === 'low');
  }
});

test('steam coaches match the passenger coach carried by the steam art', () => {
  const style = coachStyles.steam;

  assert.deepEqual(style.textureCrop, { x: 0, y: 0, width: 780, height: 271 });
  assert.equal(style.bodyColor, '#f0ca47');
  assert.equal(style.sideColor, '#fff0b4');
  assert.equal(style.roofColor, '#496f80');
  assert.equal(style.stripeColor, '#9e382f');
});

test('consist spacing keeps the head and coaches separated', () => {
  const trainWidth = 470;
  const coachWidth = 210;
  const spacing = consistSpacing(trainWidth, coachWidth, 1);
  const connector = spacing.coachLag - coachWidth;

  assert.ok(spacing.firstLag > trainWidth / 2 + coachWidth / 2);
  assert.ok(spacing.coachLag > coachWidth);
  assert.ok(connector >= 16);
});
