// netlify/functions/snapshot-pdf.js
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }

  let browser, context, page;
  try {
    // Mode aman untuk Lambda
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;

    // --- Parse input ---
    const qs =
      typeof event.rawQuery === "string"
        ? new URLSearchParams(event.rawQuery)
        : new URLSearchParams(event.queryStringParameters || {});
    const origin = getOrigin(event);
    const url = qs.get("url") || `${origin}/`;
    const format = qs.get("format") || "A4";
    const filename = qs.get("filename") || "Fahmi_Bastari_Portfolio.pdf";

    // Batasi hanya host yg sama (hindari SSRF)
    const allowedHost = new URL(origin).host;
    if (new URL(url).host !== allowedHost) {
      return json(400, { error: "URL not allowed" });
    }

    // --- Launch ---
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport, // null = full size; tetap oke
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    // Pakai incognito context beneran (kamu tulis di komentar tapi belum dipakai)
    context = await browser.createIncognitoBrowserContext();
    page = await context.newPage();

    // Micro-delay kecil utk menghindari "main frame too early"
    await wait(100);

    // --- Navigate (aman) ---
    // Tips: 'domcontentloaded' + 'network idle' setelahnya lebih stabil di SPA
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });

    // Kalau Puppeteer versi 22: gunakan 'networkidle0' via waitForNetworkIdle (tersedia)
    if (page.waitForNetworkIdle) {
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 60_000 }).catch(() => {});
    } else {
      await wait(800);
    }

    // Emulasi print tanpa memaksa — kalau gagal lanjut
    try { await page.emulateMediaType("print"); } catch {}
    await page.addStyleTag({ content: printPatchCss() });

    // Pastikan elemen-elemen yg mau kamu patch SUDAH ada
    await page.evaluate(() => {
      // set theme ke light untuk PDF
      document.documentElement.setAttribute("data-theme", "light");

      // Carousel → grid gambar (biar kepake di PDF)
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

      // Sembunyikan kontrol interaktif
      [
        ".navbar .navbar-toggler",
        ".thumbs",
        ".open-lightbox",
        ".carousel-control-prev",
        ".carousel-control-next",
        "#toTop",
        "#lightbox",
      ].forEach((sel) => document.querySelectorAll(sel).forEach((n) => (n.style.display = "none")));

      // Matikan lazy
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));

      document.body.classList.add("printing-pdf");
    });

    // beri sedikit waktu layout settle
    await wait(500);

    // --- Generate PDF ---
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format, // "A4" by default
      margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
    });

    // --- Cleanup ---
    await page.close();
    await context.close();
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
    try { if (page) await page.close(); } catch {}
    try { if (context) await context.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
    return json(500, { error: "Failed to render PDF", details: `${err?.message || err}` });
  }
};

// helpers
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}
function json(code, obj) {
  return { statusCode: code, headers: cors(), body: JSON.stringify(obj) };
}
function getOrigin(e) {
  const proto = (e.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${proto}://${e.headers.host}`;
}
function printPatchCss() {
  return `
  @page { size: A4; margin: 14mm; }
  html, body { background:#fff !important; color:#000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { animation:none !important; transition:none !important; }
  .hero { background:#fff !important; padding-top:0 !important; }
  .card { box-shadow:none !important; border:1px solid #ddd !important; }
  .project-card { break-inside: avoid; page-break-inside: avoid; margin-bottom:14mm; }
  a { color:#000 !important; text-decoration: underline; }
  .badge-tech { border-color:#ccc !important; }
  #about, #contact { page-break-before: always; }
`;
}
