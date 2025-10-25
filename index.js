const express = require("express");
const puppeteer = require("puppeteer");
const localtunnel = require("localtunnel");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

let successCounter = 0; // Track consecutive successes
const DB_FILE = path.join(__dirname, "db.txt"); // db.txt in the same folder

// Ensure db.txt exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "", "utf8");
}

// Load current db.txt into memory
function loadDB() {
    const data = fs.readFileSync(DB_FILE, "utf8");
    const lines = data.split("\n").filter(line => line.trim() !== "");
    const dbMap = new Map();
    lines.forEach(line => {
        const parts = line.split(" : ");
        if (parts.length === 2) {
            dbMap.set(parts[0].trim(), parts[1].trim());
        }
    });
    return dbMap;
}

// Append a line to db.txt
function appendToDB(itemName, itemID) {
    const line = `${itemName} : ${itemID}\n`;
    fs.appendFile(DB_FILE, line, (err) => {
        if (err) console.error(`[ERROR] Failed to write to db.txt: ${err.message}`);
    });
}

// Wait with live countdown
async function waitWithCountdown(ms, message) {
    const totalSeconds = Math.ceil(ms / 1000);
    for (let i = totalSeconds; i > 0; i--) {
        process.stdout.write(`\r${message}... ${i}s remaining`);
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log("\r" + " ".repeat(message.length + 20) + "\r"); // Clear line
}

// Fetch item_nameid endpoint
app.get("/fetch-itemid", async (req, res) => {
    const item = req.query.item;
    if (!item) return res.status(400).send("Missing ?item parameter");

    console.log(`\n[${new Date().toLocaleTimeString()}] 🔍 Fetching: ${item}`);

    // Load DB and check if item already exists
    const dbMap = loadDB();
    if (dbMap.has(item)) {
        console.log(`[INFO] Item "${item}" already exists in db.txt: ${dbMap.get(item)}`);
        return res.json({ item, itemID: dbMap.get(item), cached: true });
    }

    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--password-store=basic",          // avoid KDE Wallet
                "--disable-extensions",
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--disable-dev-shm-usage"
            ]
        });
        const page = await browser.newPage();

        const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(item)}`;
        let navSuccess = false;
        let navAttempts = 0;

        // Navigation with retry
        while (!navSuccess && navAttempts < 3) {
            try {
                navAttempts++;
                console.log(`[INFO] Navigation attempt ${navAttempts} to URL: ${url}`);
                await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
                navSuccess = true;
            } catch (err) {
                console.log(`[WARN] Navigation failed (attempt ${navAttempts}): ${err.message}`);
                if (navAttempts < 3) {
                    const retryDelay = 5000 + Math.floor(Math.random() * 5000);
                    console.log(`[INFO] Waiting ${retryDelay / 1000}s before retry...`);
                    await new Promise(r => setTimeout(r, retryDelay));
                } else {
                    throw err;
                }
            }
        }

        const html = await page.content();
        const match = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
        const itemID = match ? match[1] : null;

        await browser.close();

        if (itemID) {
            successCounter++;
            console.log(`[✅ SUCCESS] Found item_nameid for "${item}": ${itemID}`);
            console.log(`[INFO] Total successes in this session: ${successCounter}`);
            appendToDB(item, itemID); // Write to db.txt
            res.json({ item, itemID, cached: false });
        } else {
            console.log(`[❌ NOT FOUND] Item_nameid not found for "${item}"`);
            res.status(404).json({ item, error: "Not Found" });
        }

        // Cooldown after 4–5 successful fetches (30–40 seconds)
        if (successCounter >= 4) {
            const delay = 30000 + Math.floor(Math.random() * 10000); // 30–40 seconds
            await waitWithCountdown(delay, `[⏳ COOLDOWN] Reached ${successCounter} successes`);
            console.log("[INFO] Cooldown complete. Resuming fetches...");
            successCounter = 0;
        }

        // Small random delay between requests (1–5 seconds)
        const smallDelay = 1000 + Math.floor(Math.random() * 4000);
        await waitWithCountdown(smallDelay, `[INFO] Waiting before next request`);

    } catch (err) {
        console.error(`[ERROR] Failed to fetch "${item}": ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Health check
app.get("/", (req, res) => res.send("✅ Steam Scraper is running."));

app.listen(PORT, async () => {
    console.log(`[INFO] Local server running on http://localhost:${PORT}`);

    // Start localtunnel for public access
    const tunnel = await localtunnel({ port: PORT, subdomain: "TYPE UR OWN WORDS!" });
    console.log(`[🚀 PUBLIC] Public URL: ${tunnel.url}`);
    tunnel.on("close", () => console.log("[INFO] Tunnel closed"));
});
