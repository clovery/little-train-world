import test from 'node:test';
import assert from 'node:assert/strict';
import { wheelLayouts } from '../src/game/wheelLayouts.ts';

test('every selectable train has an animated wheel layout',()=>{
  const trainIds=['steam','express','freight','metro','tram','sleeper','mountain','classic','maintenance'] as const;
  for(const trainId of trainIds){
    const layout=wheelLayouts[trainId];
    assert.ok(layout.length>=4,`${trainId} needs at least four animated wheels`);
  }
});

test('wheel crops stay inside their source train image',()=>{
  for(const [train,layout] of Object.entries(wheelLayouts)){
    for(const wheel of layout){
      assert.ok(wheel.x-wheel.radius>=0,`${train} wheel crosses the left edge`);
      assert.ok(wheel.x+wheel.radius<=1,`${train} wheel crosses the right edge`);
      assert.ok(wheel.y>0&&wheel.y<=1,`${train} wheel has an invalid vertical centre`);
      assert.ok(wheel.radius>.005&&wheel.radius<.04,`${train} wheel radius is implausible`);
    }
  }
});
