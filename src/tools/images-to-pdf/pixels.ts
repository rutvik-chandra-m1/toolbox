export interface IndexedPixels {
  /** RGB triples. */
  palette: Uint8Array;
  /** One palette index per pixel. */
  indices: Uint8Array;
}

/** RGBA pixels as a palette, or null if they use more than 256 colours (a photo gives up almost at once). */
export function toIndexed(rgba: Uint8ClampedArray): IndexedPixels | null {
  const colours = new Map<number, number>();
  const indices = new Uint8Array(rgba.length / 4);

  for (let pixel = 0; pixel < indices.length; pixel++) {
    const at = pixel * 4;
    const rgb = ((rgba[at] as number) << 16) | ((rgba[at + 1] as number) << 8) | (rgba[at + 2] as number);
    let index = colours.get(rgb);
    if (index === undefined) {
      if (colours.size === 256) return null;
      index = colours.size;
      colours.set(rgb, index);
    }
    indices[pixel] = index;
  }

  const palette = new Uint8Array(colours.size * 3);
  for (const [rgb, index] of colours) palette.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255], index * 3);
  return { palette, indices };
}
