// netlify/functions/snapshot-pdf.js
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

/** Utility: small sleep */
const wait = (ms) => new Promise(res => setTimeout(res, ms));

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: cors(),
      body: ''
    };
  }

  try {
    const params = new URLSearchParams(event.rawQuery || event.queryStringParameters || {});
    // URL portofolio yang ingin dirender. Default: origin + path root.
    const url = params.get('url') || process.env.PORTFOLIO_URL || 'https://example.com/'; // ganti kalau mau fixed
    const format = params.get('format') || 'A4'; // A4 / Letter
    const filename = params.get('filename') || 'Fahmi_Bastari_Portfolio.pdf';

    // Launch headless Chromium
    const executablePath = await chromium.executablePath();
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();

    // Emulate "print" CSS & force light theme for readability
    await page.emulateMediaType('print');

    // Go to page
    await page.goto(url, { waitUntil: ['load', 'networkidle2'], timeout: 90_000 });

    // Inject helpers: force theme=light, expand carousels->gallery, load lazy images
    await page.addStyleTag({ content: printPatchCss() });
    await page.evaluate(() => {
      // Force theme to light for contrast
      document.documentElement.setAttribute('data-theme', 'light');

      // Reveal all carousel frames as stacked gallery
      document.querySelectorAll('.carousel, .carousel-inner').forEach(el => {
        el.style.display = 'block';
      });
      document.querySelectorAll('.carousel-item').forEach(el => {
        el.style.display = 'block';
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      document.querySelectorAll('.carousel-item img').forEach(img => {
        img.style.height = 'auto';
        img.style.maxHeight = 'none';
        img.style.margin = '0 0 8px 0';
      });

      // Hide interactive-only controls
      [
        '.navbar .navbar-toggler',
        '.thumbs',
        '.open-lightbox',
        '.carousel-control-prev',
        '.carousel-control-next',
        '#toTop',
        '#lightbox'
      ].forEach(sel => document.querySelectorAll(sel).forEach(n => n.style.display = 'none'));

      // Ensure all lazy images load
      document.querySelectorAll('img[loading="lazy"]').forEach(img => {
        img.loading = 'eager';
      });
      // Add print class on body if needed by site CSS
      document.body.classList.add('printing-pdf');
    });

    // Beri waktu gambar load setelah diubah eager
    await wait(600);

    // Generate PDF
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,   // hormati @page size kalau ada
      format,                    // fallback format A4/Letter
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
    console.error(err);
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({ error: 'Failed to render PDF', details: String(err) })
    };
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
}

// Minimal CSS patch biar rapi saat print via Puppeteer
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
