const TEST_URL = "https://online.vtb.ru/";

const SELECTOR_QR_TAB = [
    'text=/QR[- ]?код/i',
    'text=/Оплата по QR/i',
    'role=button[name=/QR/i]',
    '[aria-label*="QR"]',
    '[data-testid*="qr"]',
];

const SELECTOR_UPLOAD_BUTTON = [
    'text=/Загрузить файл/i',
    'text=/Загрузить изображение/i',
    'text=/Загрузить QR/i',
    'role=button[name=/Загрузить/i]',
    '[aria-label*="Загрузить"]',
    '[data-testid*="upload"]',
];

const SELECTOR_FILE_INPUT = 'input[type=file]';

const SELECTOR_SUCCESS_FIELD = [
    '.recognized',
    '[data-testid*="recognized"]',
    '[data-testid*="qr"]',
    'text=/Сумма/i',
    'text=/Получатель/i',
    'text=/Реквизиты/i',
];

const SELECTOR_SUBMIT = [
    'text=/Продолжить/i',
    'text=/Оплатить/i',
    'role=button[name=/Продолжить|Оплатить/i]',
    '.btn-primary',
    '[data-testid*="submit"]',
];

const QR_FILE = "qr_test.png";

const path = require("path");
const { chromium } = require("playwright");

async function firstVisibleLocator(page, selectors) {
    for (const sel of selectors) {
        const loc = page.locator(sel).first();
        try {
            if (await loc.isVisible({ timeout: 1500 })) return { sel, loc };
        } catch (_) {}
    }
    return null;
}

async function waitRequired(page, selector, label, timeout = 15000) {
    try {
        const handle = await page.waitForSelector(selector, { timeout });
        if (!handle) throw new Error(`Null handle for ${selector}`);
        return handle;
    } catch (err) {
        console.log(`ELEMENT_NOT_FOUND: ${label} (${selector})`);
        throw err;
    }
}

async function waitRequiredAny(page, selectors, label, timeout = 15000) {
    const start = Date.now();
    let lastErr;

    for (const sel of selectors) {
        const remain = Math.max(500, timeout - (Date.now() - start));
        try {
            const handle = await page.waitForSelector(sel, { timeout: remain });
            if (handle) return { sel, handle };
        } catch (err) {
            lastErr = err;
        }
    }

    console.log(`ELEMENT_NOT_FOUND: ${label}`);
    throw lastErr || new Error(`No selectors matched for ${label}`);
}

async function detectCaptcha(page, stage) {
    const candidates = [
        'iframe[src*="captcha"]',
        '[src*="captcha"]',
        'input[name*="captcha"]',
        '[data-testid*="captcha"]',
    ];

    for (const sel of candidates) {
        const loc = page.locator(sel).first();
        try {
            if (await loc.isVisible()) {
                console.log(`CAPTCHA_DETECTED: ${stage} (${sel})`);
                return true;
            }
        } catch (_) {}
    }

    const textLoc = page.locator('text=/капча|captcha|я не робот/i').first();
    try {
        if (await textLoc.isVisible()) {
            console.log(`CAPTCHA_DETECTED: ${stage} (text)`);
            return true;
        }
    } catch (_) {}

    console.log(`CAPTCHA_NOT_DETECTED: ${stage}`);
    return false;
}

async function tryClickAny(page, selectors) {
    const found = await firstVisibleLocator(page, selectors);
    if (!found) return false;
    try {
        await found.loc.click();
        return true;
    } catch (_) {
        try {
            await page.click(found.sel);
            return true;
        } catch (_) {}
    }
    return false;
}

async function uploadQr(page, qrFilePath) {
    await waitRequiredAny(page, SELECTOR_UPLOAD_BUTTON, "UPLOAD_BUTTON");

    for (const sel of SELECTOR_UPLOAD_BUTTON) {
        try {
            const [chooser] = await Promise.all([
                page.waitForEvent("filechooser", { timeout: 8000 }),
                page.click(sel),
            ]);
            await chooser.setFiles(qrFilePath);
            return "UPLOAD_OK";
        } catch (_) {}
    }

    const input = await waitRequired(page, SELECTOR_FILE_INPUT, "FILE_INPUT");
    await input.setInputFiles(qrFilePath);
    return "UPLOAD_OK";
}

async function waitRecognized(page) {
    for (const sel of SELECTOR_SUCCESS_FIELD) {
        try {
            await page.waitForSelector(sel, { timeout: 5000 });
            return sel;
        } catch (_) {}
    }
    throw new Error("Recognized fields not found");
}

async function clickSubmit(page) {
    await waitRequiredAny(page, SELECTOR_SUBMIT, "SUBMIT_BUTTON");

    for (const sel of SELECTOR_SUBMIT) {
        try {
            const loc = page.locator(sel).first();
            if (await loc.isVisible({ timeout: 1500 })) {
                await Promise.all([
                    page.waitForLoadState("networkidle").catch(() => {}),
                    loc.click(),
                ]);
                return true;
            }
        } catch (_) {}
    }

    for (const sel of SELECTOR_SUBMIT) {
        try {
            await Promise.all([
                page.waitForLoadState("networkidle").catch(() => {}),
                page.click(sel),
            ]);
            return true;
        } catch (_) {}
    }

    return false;
}

async function main() {
    const browser = await chromium.launch({
        headless: false,
        slowMo: 50,
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    let overallStatus = "FAIL";
    let uploadStatus = "UPLOAD_FAIL";
    let recognizedStatus = "RECOGNIZED_FAIL";
    let submitStatus = "SUBMIT_FAIL";

    const qrFilePath = path.resolve(__dirname, QR_FILE);

    try {
        await page.goto(TEST_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });

        await detectCaptcha(page, "PAGE_LOADED");

        if (Array.isArray(SELECTOR_QR_TAB) && SELECTOR_QR_TAB.length) {
            await tryClickAny(page, SELECTOR_QR_TAB).catch(() => {});
        }

        try {
            uploadStatus = await uploadQr(page, qrFilePath);
            console.log(uploadStatus);
        } catch (err) {
            uploadStatus = "UPLOAD_FAIL";
            console.log(uploadStatus);
            throw err;
        }

        try {
            const matched = await waitRecognized(page);
            recognizedStatus = "RECOGNIZED_OK";
            console.log(recognizedStatus);
            try {
                const txt = await page.locator(matched).first().innerText();
                if (txt && txt.trim()) console.log("RECOGNIZED_CONTENT:", txt.trim());
            } catch (_) {}
        } catch (err) {
            recognizedStatus = "RECOGNIZED_FAIL";
            console.log(recognizedStatus);
            throw err;
        }

        await detectCaptcha(page, "AFTER_RECOGNIZED");

        try {
            const ok = await clickSubmit(page);
            if (!ok) throw new Error("Submit click failed");
            submitStatus = "SUBMIT_OK";
            console.log(submitStatus);
        } catch (err) {
            submitStatus = "SUBMIT_FAIL";
            console.log(submitStatus);
            throw err;
        }

        await detectCaptcha(page, "AFTER_SUBMIT");

        await page.waitForTimeout(3000);

        await page.screenshot({
            path: "result.png",
            fullPage: true,
        });

        overallStatus = "SUCCESS";
    } catch (err) {
        try {
            if (!page.isClosed()) {
                await page.screenshot({
                    path: "error.png",
                    fullPage: true,
                });
            }
        } catch (_) {}
    } finally {
        console.log("=== FINAL LOG ===");
        console.log("OVERALL_STATUS:", overallStatus);
        console.log("UPLOAD:", uploadStatus);
        console.log("RECOGNIZED:", recognizedStatus);
        console.log("SUBMIT:", submitStatus);
        await browser.close();
    }
}

main().catch((e) => {
    console.error("UNHANDLED_ERROR:", e);
    process.exitCode = 1;
});
