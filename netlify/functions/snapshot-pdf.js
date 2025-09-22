import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }

  let browser, page;
  try {
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;

    // --- params ---
    const qs =
      typeof event.rawQuery === "string"
        ? new URLSearchParams(event.rawQuery)
        : new URLSearchParams(event.queryStringParameters || {});
    const origin = getOrigin(event);
    const url = qs.get("url") || `${origin}/`;
    const format = qs.get("format") || "A4";
    const filename = qs.get("filename") || "Fahmi_Bastari_Portfolio.pdf";

    // Batasi ke host yang sama (hindari SSRF)
    const allowedHost = new URL(origin).host;
    if (new URL(url).host !== allowedHost) {
      return json(400, { error: "URL not allowed" });
    }

    // --- launch (args stabil) ---
    const executablePath = await chromium.executablePath();
    const launchCommon = () => puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        // "--single-process",   // ❌ buang, bikin rapuh
        // "--no-zygote",        // ❌ buang
        "--disable-gpu",
        "--hide-scrollbars",
        "--mute-audio",
        "--font-render-hinting=none",
      ],
      defaultViewport: { width: 1024, height: 768, deviceScaleFactor: 1 },
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    async function launchWithRelaunch() {
      try { return await launchCommon(); }
      catch { return await launchCommon(); }
    }

    browser = await launchWithRelaunch();

    // === NAVIGASI ANTI-RACE + ANTI "MAIN FRAME TOO EARLY" ===
    page = await gotoWithRetry(browser, url);

    // --- Siapkan DOM untuk print & preload aset ---
    await prepareForPrint(page);
    await preloadAssets(page);

    // --- PDF dengan retry kalau frame/detached ---
// --- PDF dengan retry (recreate page kalau detached) ---
const { pdf, page: activePage } = await pdfWithRetry(browser, page, url, {
    printBackground: true,
    preferCSSPageSize: true,
    format,
    margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
  });
  
  // pakai 'activePage' buat cleanup (bisa page lama atau baru)
  await activePage.close();
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
    try { if (browser) await browser.close(); } catch {}
    return json(500, { error: "Failed to render PDF", details: `${err?.message || err}` });
  }
};

// ====== Helper: nav with retry ======
async function gotoWithRetry(browser, targetUrl) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const p = await newPageHardened(browser);
    try {
      await wait(80);
      await p.goto("about:blank", { waitUntil: "load" }).catch(() => {});
      await wait(50);

      await p.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });

      if (p.waitForNetworkIdle) {
        await p.waitForNetworkIdle({ idleTime: 800, timeout: 60_000 }).catch(() => {});
      } else {
        await wait(600);
      }
      return p;
    } catch (e) {
      lastErr = e;
      await p.close().catch(() => {});
      const msg = String(e?.message || e);
      if (!(msg.includes("main frame too early") || msg.includes("Connection closed"))) break;
    }
  }
  throw lastErr;
}

// Bikin page dengan proteksi: kalau Connection closed, relaunch browser sekali
async function newPageHardened(browser) {
  try {
    return await browser.newPage();
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("Connection closed")) {
      try { await browser.close(); } catch {}
      const executablePath = await chromium.executablePath();
      const relaunched = await puppeteer.launch({
        args: [
          ...chromium.args,
          "--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage",
          "--disable-gpu","--hide-scrollbars","--mute-audio","--font-render-hinting=none",
        ],
        defaultViewport: { width: 1024, height: 768, deviceScaleFactor: 1 },
        executablePath,
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
      return await relaunched.newPage();
    }
    throw e;
  }
}

/* ====== PRINT HELPERS ====== */
async function prepareForPrint(page){
  try { await page.emulateMediaType("print"); } catch {}
  await page.addStyleTag({ content: printPatchCss() });

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");

    // tampilkan semua kartu & lewati IO
    document.querySelectorAll('.project-card').forEach(card => { card.style.display = ''; card.hidden = false; });
    document.querySelectorAll('.fade-in').forEach(el => { el.classList.add('show'); el.style.opacity = '1'; el.style.transform = 'none'; });

    // jadikan carousel -> galeri
    document.querySelectorAll(".carousel, .carousel-inner").forEach(el => el.style.display = "block");
    document.querySelectorAll(".carousel-item").forEach(el => { el.style.display = "block"; el.style.opacity = "1"; el.style.transform = "none"; });
    document.querySelectorAll(".carousel-item img").forEach(img => {
      img.style.height = "auto"; img.style.maxHeight = "none"; img.style.margin = "0 0 8px 0";
    });

    // sembunyikan kontrol interaktif
    [".navbar .navbar-toggler",".thumbs",".open-lightbox",".carousel-control-prev",".carousel-control-next","#toTop","#lightbox"]
      .forEach(sel => document.querySelectorAll(sel).forEach(n => n.style.display = "none"));

    // eager images & flag body
    document.querySelectorAll('img[loading="lazy"]').forEach(img => (img.loading = "eager"));
    document.body.classList.add("printing-pdf");
  });
}

async function preloadAssets(page){
  try { await page.evaluateHandle('document.fonts.ready'); } catch {}
  await page.waitForFunction(() => {
    const imgs = Array.from(document.images || []);
    return imgs.every(img => img.complete && img.naturalWidth > 0);
  }, { timeout: 30000 }).catch(() => {});
  await wait(200);
}

async function pdfWithRetry(browser, page, targetUrl, opts){
    // attempt 1: langsung cetak
    try {
      const pdf = await page.pdf(opts);
      return { pdf, page };
    } catch (e) {
      const msg = String(e?.message || e);
      const isDetached =
        msg.includes("Execution context is not available") ||
        msg.includes("detached Frame") ||
        msg.includes("Cannot find context with specified id") ||
        msg.includes("Target closed") ||
        msg.includes("Connection closed");
  
      if (!isDetached) throw e;
  
      // attempt 2: TUTUP page lama, buat page baru, ulangi semua langkah
      try { await page.close(); } catch {}
  
      const freshPage = await gotoWithRetry(browser, targetUrl);
      await prepareForPrint(freshPage);
      await preloadAssets(freshPage);
  
      const pdf = await freshPage.pdf(opts);
      return { pdf, page: freshPage };
    }
  }
  

/* ===== helpers ===== */
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

  /* Hero polos + kartu rapi */
  .hero { background:#fff !important; padding-top:0 !important; }
  .card { box-shadow:none !important; border:1px solid #ddd !important; }

  /* Pastikan semua project tampil & anti-pecah halaman */
  .project-card { display:block !important; break-inside: avoid; page-break-inside: avoid; margin-bottom:14mm; }
  .fade-in { opacity:1 !important; transform:none !important; }

  /* === Carousel -> Galeri (kunci!) === */
  .carousel { overflow: visible !important; }
  .carousel-inner {
    overflow: visible !important;
    display: grid !important;
    grid-template-columns: 1fr 1fr; /* ubah ke 1fr 1fr 1fr untuk 3 kolom */
    gap: 8px;
    height: auto !important;
  }
  .carousel-item {
    display: block !important;
    position: static !important;
    float: none !important;
    opacity: 1 !important;
    transform: none !important;
    margin: 0 !important;
  }
  .carousel-item img {
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    margin: 0 0 8px 0 !important;
  }

  /* Tipografi & link */
  a { color:#000 !important; text-decoration: underline; }
  .badge-tech { border-color:#ccc !important; }

  /* Sembunyikan elemen interaktif */
  .navbar, #toTop, .thumbs, .open-lightbox, .carousel-control-prev, .carousel-control-next,
  #lightbox, .btn, .input-group, .btn-filter, .slide-counter { display:none !important; }

  /* Section breaks */
  #about { page-break-before: always; }
  #contact { page-break-before: always; }
`; }
