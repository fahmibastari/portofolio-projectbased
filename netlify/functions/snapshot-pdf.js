import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 204, headers: cors(), body: "" };

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

    // SSRF guard: hanya host yg sama
    const allowedHost = new URL(origin).host;
    if (new URL(url).host !== allowedHost) {
      return json(400, { error: "URL not allowed" });
    }

    // --- launch ---
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      // viewport eksplisit bantu stabil di Lambda
      defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    // === NAVIGASI TAHAN ERROR (retry sekali) ===
    page = await gotoWithRetry(browser, url);

    // --- patch print ---
    try { await page.emulateMediaType("print"); } catch {}
    await page.addStyleTag({ content: printPatchCss() });

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");

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

      [
        ".navbar .navbar-toggler",
        ".thumbs",
        ".open-lightbox",
        ".carousel-control-prev",
        ".carousel-control-next",
        "#toTop",
        "#lightbox",
      ].forEach((sel) => document.querySelectorAll(sel).forEach((n) => (n.style.display = "none")));

      document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));
      document.body.classList.add("printing-pdf");
    });

    await wait(500);

    // --- pdf ---
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format,
      margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
    });

    await page.close();
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

// ===== helper: gotoWithRetry =====
async function gotoWithRetry(browser, targetUrl) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const p = await browser.newPage();
    try {
      // siapkan main frame
      await p._client().send("Page.enable").catch(() => {});
      await p.goto("about:blank", { waitUntil: "load" }).catch(() => {});
      await wait(80);

      await p.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });

      if (p.waitForNetworkIdle) {
        await p.waitForNetworkIdle({ idleTime: 800, timeout: 60_000 }).catch(() => {});
      } else {
        await wait(600);
      }
      return p; // sukses
    } catch (e) {
      lastErr = e;
      await p.close().catch(() => {});
      // retry hanya untuk kasus 'main frame too early'
      if (!String(e?.message || e).includes("main frame too early")) break;
      // loop coba lagi
    }
  }
  throw lastErr;
}

// ===== helpers lainnya =====
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
