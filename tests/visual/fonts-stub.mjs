/* Answers the page's web font requests with an empty stub, so every shot uses the fallback fonts (the page must work
   without them) and no network is needed. An aborted request would log a failed load; an empty 200 loads nothing and
   logs nothing. The hosts are the ones in src/index.html (Google Fonts) and src/styles/pieces.css (the HQ glyph font). */

const FONT_HOSTS = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//;

/* The stub for one request: an empty stylesheet for a stylesheet link, an empty file for a font. */
function stubFor(url) {
  return url.includes('googleapis.com')
    ? { status: 200, contentType: 'text/css', body: '/* stub */' }
    : { status: 200, contentType: 'font/woff2', body: '' };
}

/* Routes the font hosts of the page to the stub, on a browser context. Any other request that leaves the machine is
   aborted, so a shot never depends on the network. */
export async function stubWebFonts(context) {
  await context.route(/^https?:\/\//, route => {
    const url = route.request().url();
    return FONT_HOSTS.test(url) ? route.fulfill(stubFor(url)) : route.abort();
  });
}
