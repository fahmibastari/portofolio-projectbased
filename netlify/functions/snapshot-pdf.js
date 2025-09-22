// netlify/functions/snapshot-pdf.js
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 204, headers: cors(), body: "" };

  let browser;
  try {
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;

    const qs =
      typeof event.rawQuery === "string"
        ? new URLSearchParams(event.rawQuery)
        : new URLSearchParams(event.queryStringParameters || {});
    const origin = getOrigin(event);
    const url = qs.get("url") || `${origin}/`;
    const format = qs.get("format") || "A4";
    const filename = qs.get("filename") || "Fahmi_Bastari_Portfolio.pdf";

    // izinkan hanya domain sendiri
    const allowedHost = new URL(origin).host;
    if (new URL(url).host !== allowedHost) {
      return json(400, { error: "URL not allowed" });
    }

    // Launch Chromium
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // ⛔️ JANGAN emulasi print di sini — bikin crash di Netlify lambdas
    // await page.emulateMediaType('print');

    // Go to page dulu, tunggu idle
    await page.goto(url, { waitUntil: ["load", "networkidle2"], timeout: 90_000 });

    // Baru coba emulasi print (optional). Kalau gagal, lanjut aja.
    try { await page.emulateMediaType("print"); } catch {}

    // Patch CSS/DOM supaya layout print rapi
    await page.addStyleTag({ content: printPatchCss() });

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");

      // tumpuk semua slide seperti galeri
      document.querySelectorAll(".carousel, .carousel-inner").forEach((el) => (el.style.display = "block"));
      document.querySelectorAll(".carousel-item").forEach((el) => {
        el.style.display = "block";
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      document.querySelectorAll(".carousel-item img").forEach((img) => {
        img.style.height = "auto";
        img.style.maxHeight = "none";
        img.style.margin = "0 0 8px 0";
      });

      // sembunyikan kontrol interaktif
      [
        ".navbar .navbar-toggler",
        ".thumbs",
        ".open-lightbox",
        ".carousel-control-prev",
        ".carousel-control-next",
        "#toTop",
        "#lightbox",
      ].forEach((sel) => document.querySelectorAll(sel).forEach((n) => (n.style.display = "none")));

      // paksa lazy → eager
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));

      document.body.classList.add("printing-pdf");
    });

    // beri sedikit waktu setelah eager load
    await wait(800);

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,  // hormati @page size
      format,                    // fallback kalau @page ga ada
      margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
    });

    await browser.close();

    return {
      statusCode: 200,
      headers: {
        ...cors(),
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: pdf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("[snapshot-pdf] ERROR:", err);
    try { if (browser) await browser.close(); } catch {}
    return json(500, { error: "Failed to render PDF", details: `${err?.message || err}` });
  }
};

// helpers
function cors(){ return {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"Content-Type",
  "Access-Control-Allow-Methods":"GET, OPTIONS"
};}
function json(code, obj){ return { statusCode: code, headers: cors(), body: JSON.stringify(obj) }; }
function getOrigin(e){ const proto=(e.headers["x-forwarded-proto"]||"https").split(",")[0].trim(); return `${proto}://${e.headers.host}`; }
function printPatchCss(){ return `
  @page { size: A4; margin: 14mm; }
  html, body { background:#fff !important; color:#000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { animation:none !important; transition:none !important; }
  .hero { background:#fff !important; padding-top:0 !important; }
  .card { box-shadow:none !important; border:1px solid #ddd !important; }
  .project-card { break-inside: avoid; page-break-inside: avoid; margin-bottom:14mm; }
  a { color:#000 !important; text-decoration: underline; }
  .badge-tech { border-color:#ccc !important; }
  #about, #contact { page-break-before: always; }
`; }
