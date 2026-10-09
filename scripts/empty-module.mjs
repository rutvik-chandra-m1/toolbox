// Stand-in for packages the app never actually uses at runtime.
// See `resolve.alias` in vite.config.ts: jsPDF lazily imports canvg and
// dompurify for jsPDF.html() and SVG images, which this app does not call, so
// bundling them would only add ~180 KB of dead code to the offline cache.
export default {};
