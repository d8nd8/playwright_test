const { chromium, devices } = require("playwright");
const fs = require("fs");

(async () => {
    const iPhone = devices["iPhone 13 Pro"];

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ ...iPhone });
    const page = await context.newPage();

    await page.goto("https://online.vtb.ru"); // страница, где ты логинишься вручную

    console.log("Войди в ВТБ вручную. После входа — нажми ENTER в терминале.");

    process.stdin.once("data", async () => {
        const state = await context.storageState();
        fs.writeFileSync("vtb_state.json", JSON.stringify(state, null, 2));
        console.log("СОХРАНЕНО: vtb_state.json");
        await browser.close();
        process.exit(0);
    });
})();
