// netlify/functions/snapshot-pdf.js
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  try {
    // --- CONFIG NETLIFY/LAMBDA QUIRKS ---
    // (Direkomendasikan oleh @sparticuz untuk platform serverless)
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;

    // --- PARSE PARAMS ---
    const qs =
      typeof event.rawQuery === 'string'
        ? new URLSearchParams(event.rawQuery)
        : new URLSearchParams(event.queryStringParameters || {});

    // Jika user tidak mengirim 'url', pakai origin dari request
    const origin = getOrigin(event);
    const url = qs.get('url') || process.env.PORTFOLIO_URL || `${origin}/`;
    const format = qs.get('format') || 'A4';
    const filename = qs.get('filename') || 'Fahmi_Bastari_Portfolio.pdf';

    // (opsional) batasi domain agar aman
    const { host } = new URL(url);
    const allowedHosts = [hostFromOrigin(origin)];
    if (!allowedHosts.includes(host)) {
      return json(400, { error: `URL not allowed: ${host}` });
    }

    // --- LAUNCH CHROMIUM ---
    const executablePath = await chromium.executablePath();
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();

    // Emulate print CSS
    await page.emulateMediaType('print');

    // --- NAVIGATE ---
    await page.goto(url, { waitUntil: ['load', 'networkidle2'], timeout: 90_000 });

    // --- PATCH PRINT DOM ---
    await page.addStyleTag({ content: printPatchCss() });
    await page.evaluate(() => {
      // Paksa tema terang
      document.documentElement.setAttribute('data-theme', 'light');

      // Ubah carousel jadi galeri bertumpuk
      document.querySelectorAll('.carousel, .carousel-inner').forEach((el) => (el.style.display = 'block'));
      document.querySelectorAll('.carousel-item').forEach((el) => {
        el.style.display = 'block';
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      document.querySelectorAll('.carousel-item img').forEach((img) => {
        img.style.height = 'auto';
        img.style.maxHeight = 'none';
        img.style.margin = '0 0 8px 0';
      });

      // Sembunyikan kontrol interaktif
      [
        '.navbar .navbar-toggler',
        '.thumbs',
        '.open-lightbox',
        '.carousel-control-prev',
        '.carousel-control-next',
        '#toTop',
        '#lightbox'
      ].forEach((sel) => document.querySelectorAll(sel).forEach((n) => (n.style.display = 'none')));

      // Paksa lazy images jadi eager
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = 'eager'));

      document.body.classList.add('printing-pdf');
    });

    // Beri waktu gambar selesai load
    await wait(700);

    // --- GENERATE PDF ---
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' }
    });

    await browser.close();

    return {
      statusCode: 200,
      headers: {
        ...cors(),
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      },
      body: pdf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    // LOG DETAIL ke Function logs (Netlify dashboard)
    console.error('[snapshot-pdf] ERROR:', err);
    return json(500, { error: 'Failed to render PDF', details: String(err) });
  }
};

// ---------- helpers ----------
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
}
function json(code, obj) {
  return { statusCode: code, headers: cors(), body: JSON.stringify(obj) };
}
function getOrigin(event) {
  // Netlify selalu kirim header 'x-forwarded-proto' & 'host'
  const proto = (event.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = event.headers.host;
  return `${proto}://${host}`;
}
function hostFromOrigin(origin) {
  try { return new URL(origin).host; } catch { return origin; }
}
function printPatchCss() {
  return `
    @page { size: A4; margin: 14mm; }
    html, body { background: #fff !important; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    * { animation: none !important; transition: none !important; }
    .hero { background: #fff !important; padding-top: 0 !important; }
    .card { box-shadow: none !important; border: 1px solid #ddd !important; }
    .project-card { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14mm; }
    a { color: #000 !important; text-decoration: underline; }
    .badge-tech { border-color: #ccc !important; }
    #about, #contact { page-break-before: always; }
  `;
}
