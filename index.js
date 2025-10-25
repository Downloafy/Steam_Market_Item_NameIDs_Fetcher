const express = require("express");
const puppeteer = require("puppeteer");
const localtunnel = require("localtunnel");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
let successCount = 0;
const dbPath = path.join(__dirname, "db.txt");

// make sure db exists
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "");

// small helpers
const wait = ms => new Promise(r => setTimeout(r, ms));
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;

// get cached data
function getCache() {
    const lines = fs.readFileSync(dbPath, "utf8").split("\n");
    const map = new Map();
    lines.forEach(l => {
        const parts = l.split(" : ");
        if (parts.length === 2) map.set(parts[0].trim(), parts[1].trim());
    });
        return map;
}

// append to cache
function saveToCache(name, id) {
    fs.appendFileSync(dbPath, `${name} : ${id}\n`);
    console.log(`saved -> ${name} : ${id}`);
}

// log countdown timer
async function logCountdown(sec, msg) {
    for (let i = sec; i > 0; i--) {
        process.stdout.write(`\r${msg} (${i}s)`);
        await wait(1000);
    }
    process.stdout.write("\r" + " ".repeat(40) + "\r");
}

// random data pools
const uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
];

const langs = ["en-US,en;q=0.9", "en-GB,en;q=0.8,en-US;q=0.6"];
const viewports = [
    { width: 1366, height: 768 },
{ width: 1600, height: 900 },
{ width: 1920, height: 1080 }
];

// make puppeteer look less like bot
async function applyStealth(page, ua) {
    await page.evaluateOnNewDocument(uaStr => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, "userAgent", { get: () => uaStr });
    }, ua);
}

app.get("/fetch-itemid", async (req, res) => {
    const item = req.query.item;
    if (!item) return res.status(400).send("Missing item name");

    console.log(`\n--- fetching: ${item}`);

    const cache = getCache();
    if (cache.has(item)) {
        console.log(`cached -> ${cache.get(item)}`);
        return res.json({ item, id: cache.get(item), cached: true });
    }

    const ua = uas[random(0, uas.length - 1)];
    const vp = viewports[random(0, viewports.length - 1)];

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--password-store=basic",
                "--disable-dev-shm-usage"
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent(ua);
        await page.setViewport(vp);
        await page.setExtraHTTPHeaders({ "accept-language": langs[random(0, langs.length - 1)] });
        await applyStealth(page, ua);

        const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(item)}`;
        console.log(`loading ${url}`);

        await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
        await wait(random(800, 2000));

        const html = await page.content();
        const match = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
        await browser.close();

        if (!match) {
            console.log("not found");
            return res.status(404).json({ item, error: "Not found" });
        }

        const id = match[1];
        console.log(`found -> ${id}`);
        saveToCache(item, id);
        res.json({ item, id });

        successCount++;
        if (successCount >= 4) {
            const cooldown = random(30, 40);
            console.log(`cooldown ${cooldown}s`);
            await logCountdown(cooldown, "cooldown");
            successCount = 0;
        }

        await wait(random(1000, 4000));
    } catch (err) {
        if (browser) await browser.close().catch(() => {});
        console.log("error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get("/", (_, res) => res.send("Scraper running."));

app.listen(PORT, async () => {
    console.log(`local on ${PORT}`);
    const tunnel = await localtunnel({ port: PORT });
    console.log(`public link: ${tunnel.url}`);
});
