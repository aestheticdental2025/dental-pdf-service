const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const app = express();

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.send('PDF Service is running.');
});

app.post('/generate-pdf', async (req, res) => {
  const { html } = req.body;
  if (!html) return res.status(400).send('HTML required');

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: ['networkidle0', 'domcontentloaded'], timeout: 60000 });

    // Wait for fonts and images
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 2000));

    // Override ALL page-break CSS to prevent unwanted breaks and black gaps
    await page.addStyleTag({ content: `
      * {
        page-break-before: auto !important;
        break-before: auto !important;
        page-break-after: auto !important;
        break-after: auto !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      .cover { min-height: auto !important; }
    `});

    // Get full page height after styles applied
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);

    const pdf = await page.pdf({
      width: '113.8mm',
      height: `${bodyHeight * 0.2646}mm`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Treatment_Plan.pdf"',
      'Content-Length': pdf.length
    });
    res.send(pdf);

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(err);
    res.status(500).send('PDF generation failed: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PDF service running on port ${PORT}`));
