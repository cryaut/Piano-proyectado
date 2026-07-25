export interface EditorGridPointInput {
  clientX: number;
  clientY: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  keyWidth: number;
  zoomX: number;
  zoomY: number;
  scrollX: number;
  scrollY: number;
  startMidi: number;
  totalKeys: number;
}

export interface EditorGridPoint {
  x: number;
  y: number;
  row: number;
  visibleRow: number;
  verticalScrollRows: number;
  midi: number;
  beat: number;
  outOfBounds: boolean;
  rowFloat: number;
  scaleX: number;
  scaleY: number;
}

export const resolveEditorGridPoint = (input: EditorGridPointInput): EditorGridPoint => {
  const scaleX = input.canvasWidth / Math.max(1, input.rectWidth);
  const scaleY = input.canvasHeight / Math.max(1, input.rectHeight);
  const x = (input.clientX - input.rectLeft) * scaleX;
  const y = (input.clientY - input.rectTop) * scaleY;
  const rowFloat = (input.canvasHeight - y) / input.zoomY;
  const visibleRow = Math.floor(rowFloat);
  const verticalScrollRows = Math.max(0, Math.min(input.totalKeys - 1, Math.round(input.scrollY)));
  const row = visibleRow + verticalScrollRows;
  const maxMidi = input.startMidi + input.totalKeys - 1;
  const rawMidi = row + input.startMidi;
  const midi = Math.max(input.startMidi, Math.min(maxMidi, rawMidi));
  const beat = (x - input.keyWidth + input.scrollX) / input.zoomX;
  const outOfBounds = x < input.keyWidth || x > input.canvasWidth || y < 0 || y > input.canvasHeight || row < 0 || row > input.totalKeys - 1;

  return { x, y, row, visibleRow, verticalScrollRows, midi, beat, outOfBounds, rowFloat, scaleX, scaleY };
};
