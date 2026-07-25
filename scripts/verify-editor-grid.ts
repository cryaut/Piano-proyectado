import { resolveEditorGridPoint } from '../src/editor/EditorGridMath';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const base = {
  rectLeft: 100,
  rectTop: 50,
  rectWidth: 900,
  rectHeight: 480,
  canvasWidth: 900,
  canvasHeight: 480,
  keyWidth: 60,
  zoomX: 80,
  zoomY: 16,
  scrollX: 0,
  scrollY: 36,
  startMidi: 21,
  totalKeys: 88,
};

type Overrides = Partial<typeof base>;

const pointAt = (row: number, yOffsetFromRowTop: number, overrides: Overrides = {}) => {
  const input = { ...base, ...overrides };
  const top = input.rectTop + input.canvasHeight - (row + 1) * input.zoomY;
  return resolveEditorGridPoint({
    ...input,
    clientX: input.rectLeft + input.keyWidth + 80,
    clientY: top + yOffsetFromRowTop,
  });
};

const expectMidi = (row: number, expectedMidi: number, overrides: Overrides = {}) => {
  const input = { ...base, ...overrides };
  const samples = [0.5, input.zoomY / 2, input.zoomY - 0.5];

  samples.forEach((sample) => {
    const point = pointAt(row, sample, overrides);
    assert(point.midi === expectedMidi, `Row ${row} at y-offset ${sample} should resolve MIDI ${expectedMidi}, got ${point.midi}`);
    assert(Number.isInteger(point.midi), `Row ${row} produced fractional MIDI ${point.midi}`);
    assert(point.visibleRow === row, `Row ${row} produced visibleRow ${point.visibleRow}`);
    assert(point.row === row + point.verticalScrollRows, `Row ${row} should include integer vertical scroll`);
    assert(!String(point.midi).includes('.'), `MIDI ${point.midi} should not stringify as fractional`);
  });
};

for (let row = 0; row < base.canvasHeight / base.zoomY; row += 1) {
  expectMidi(row, base.startMidi + base.scrollY + row);
}

assert(pointAt(0, base.zoomY).midi === 57, 'Canvas bottom should be included in first visible row');
assert(pointAt(0, 0).midi === 58, 'Exact row boundary should resolve to the upper screen row');
assert(pointAt(12, base.zoomY / 2).midi === 69, 'Middle test row should resolve exactly');
assert(pointAt(29, base.zoomY / 2).midi === 86, 'Upper visible row should resolve exactly');

expectMidi(12, 81, { scrollY: 48 });
expectMidi(12, 69, { scrollY: 36.49 });
expectMidi(12, 70, { scrollY: 36.5 });
expectMidi(8, 65, { zoomY: 20, canvasHeight: 500, rectHeight: 500 });

const scaled = resolveEditorGridPoint({
  ...base,
  rectWidth: 720,
  rectHeight: 384,
  clientX: base.rectLeft + (base.keyWidth + 80) * 0.8,
  clientY: base.rectTop + (base.canvasHeight - 12 * base.zoomY - base.zoomY / 2) * 0.8,
});
assert(scaled.midi === 69, 'CSS scaled canvas should preserve row hit testing');
assert(scaled.scaleX === 1.25 && scaled.scaleY === 1.25, 'CSS scaling factors should be reported');

const out = resolveEditorGridPoint({ ...base, clientX: base.rectLeft + 20, clientY: base.rectTop + 100 });
assert(out.outOfBounds, 'Clicks inside piano-label gutter should be out of bounds');
assert(Number.isInteger(out.midi), 'Out-of-bounds points should still produce an integer clamped MIDI for debug');

console.log('Editor grid coordinate verification passed.');
