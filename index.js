// index.js
import express from "express";
import fs from "fs";
import puppeteer from "puppeteer";
import path from "path";
import localtunnel from "localtunnel";

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db.txt");

let fetchCount = 0;
let totalRequests = 0;

function log(message) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${message}`);
}

function itemExists(itemName) {
    if (!fs.existsSync(DB_FILE)) return false;
    const entries = fs.readFileSync(DB_FILE, "utf8").split("\n");
    return entries.some(line => line.startsWith(itemName + " :"));
}

function saveItem(itemName, itemId) {
    if (!itemExists(itemName)) {
        fs.appendFileSync(DB_FILE, `${itemName} : ${itemId}\n`, "utf8");
        log(`Saved ${itemName} : ${itemId} to db.txt`);
    } else {
        log(`Skipped duplicate entry for ${itemName}`);
    }
}

// ---------- Root route handles item queries ----------
app.get("/", async (req, res) => {
    totalRequests++;
    const itemName = req.query.item;

    if (!itemName) {
        return res.send(`
        <h1>Steam Scraper API</h1>
        <p>Use ?item=ITEM_NAME to fetch an item ID.</p>
        `);
    }

    log(`Fetching item ID for: ${itemName}`);

    if (itemExists(itemName)) {
        const lines = fs.readFileSync(DB_FILE, "utf8").split("\n");
        const existing = lines.find(line => line.startsWith(itemName + " :"));
        const cachedId = existing?.split(": ")[1]?.trim();
        log(`Found cached item: ${itemName} -> ${cachedId}`);
        return res.json({ item: itemName, itemID: cachedId, source: "cache" });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--password-store=basic",
                "--disable-extensions",
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--disable-dev-shm-usage"
            ]
        });

        const page = await browser.newPage();
        const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(itemName)}`;

        log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForTimeout(2000);

        const html = await page.content();
        const match = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
        const itemId = match ? match[1] : null;

        if (!itemId) {
            log(`No item ID found for ${itemName}`);
            return res.status(404).json({ item: itemName, error: "Item ID not found" });
        }

        log(`Item ID found for ${itemName}: ${itemId}`);
        saveItem(itemName, itemId);

        fetchCount++;
        res.json({ item: itemName, itemID: itemId, status: "success" });

        if (fetchCount >= 4) {
            log("Cooldown: waiting 30 seconds before next batch.");
            for (let seconds = 30; seconds > 0; seconds--) {
                process.stdout.write(`\rResuming in ${seconds}s...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            console.log();
            fetchCount = 0;
        }

    } catch (error) {
        log(`Error fetching ${itemName}: ${error.message}`);
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

// ---------- Start server and LocalTunnel ----------
app.listen(PORT, async () => {
    log(`Server started on port ${PORT}`);

    try {
        const tunnel = await localtunnel({ port: PORT });
        log(`Public URL via LocalTunnel: ${tunnel.url}`);

        setInterval(async () => {
            try {
                await fetch(tunnel.url);
                log("Pinged tunnel to keep it alive");
            } catch (err) {
                log(`Error pinging tunnel: ${err.message}`);
            }
        }, 25000);

        process.on("exit", () => tunnel.close());
        process.on("SIGINT", () => { tunnel.close(); process.exit(); });
        process.on("SIGTERM", () => { tunnel.close(); process.exit(); });
    } catch (err) {
        log(`Failed to start LocalTunnel: ${err.message}`);
    }
});
