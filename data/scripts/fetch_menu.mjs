import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load } from "cheerio";

const execFileAsync = promisify(execFile);

const MENU_URL = "https://menus.tenkites.com/eliorna/d0358";
const OUT = "public/menu.json";

// The kitchen plans about three weeks out, but a week is as far as anyone
// asks, and it is the range the popup can still name by weekday.
const DAYS_AHEAD = 7;

// Today is re-read on every run (this script runs every 30 minutes), but the
// days after it change rarely and cost four requests each, so they are only
// re-read twice a day.
const FUTURE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const uniq = (arr) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function fetchHtml(url) {
 const { stdout } = await execFileAsync("curl", ["-sS", "-A", "Mozilla/5.0", url], {
 maxBuffer: 20 * 1024 * 1024
 });
 return stdout;
}

function parseBaseMeta(html) {
 const dateMatch = html.match(/k10\.settings\.menu\.date\s*=\s*'([^']+)'/);
 const locationMatch = html.match(/k10\.settings\.menu\.location\.guid\s*=\s*'([^']+)'/);

 if (!dateMatch || !locationMatch) {
 throw new Error("Cannot parse menu date/location from source HTML");
 }

 const $ = load(html);
 const mealIds = {};

 $(".k10-menu-selector__option").each((_, el) => {
 const name = norm($(el).text());
 const id = ($(el).attr("data-menu-identifier") || "").trim();
 if (name && id) mealIds[name] = id;
 });

 return {
 date: dateMatch[1],
 locationGuid: locationMatch[1],
 mealIds
 };
}

function buildMenuUrl({ locationGuid, date, menuGuid }) {
 const u = new URL(MENU_URL);
 u.searchParams.set("cl", "true");
 u.searchParams.set("mguid", locationGuid);
 u.searchParams.set("mldate", date);
 u.searchParams.set("mlguid", menuGuid);
 u.searchParams.set("internalrequest", "true");
 return u.toString();
}

function buildDayUrl(date) {
 const u = new URL(MENU_URL);
 u.searchParams.set("mldate", date);
 return u.toString();
}

function extractSectionItems(html, sectionName) {
 const $ = load(html);
 const target = norm(sectionName);

 const $course = $(".k10-course.k10-course_level_1").filter((_, el) => {
 const title = norm($(el).find(".k10-course__name_level_1").first().text());
 return title === target;
 }).first();

 if ($course.length === 0) return [];

 return uniq(
 $course.find(".k10-recipe__name").map((_, el) => $(el).text()).get()
 );
}

const MEAL_PLAN = [
 { key: "breakfast", label: "breakfast" },
 { key: "lunch", label: "lunch" },
 { key: "dinner", label: "dinner" }
];

function emptyMenus() {
 return {
 breakfast: { classicKitchen: [], globalFare: [] },
 lunch: { classicKitchen: [], globalFare: [] },
 dinner: { classicKitchen: [], globalFare: [] }
 };
}

function countItems(menus) {
 return MEAL_PLAN.reduce((sum, meal) => {
 const item = menus[meal.key];
 return sum + item.classicKitchen.length + item.globalFare.length;
 }, 0);
}

/**
 * The three meals for one date, or null when nothing is published for it.
 *
 * Every date carries its own meal identifiers, and asking for one date with
 * another's ids silently returns the wrong meal — so the day's own page is
 * read first, even though that costs an extra request.
 */
async function fetchMenusForDate(date, locationGuid, knownMeta) {
 const meta = knownMeta ?? parseBaseMeta(await fetchHtml(buildDayUrl(date)));

 // Past the last planned day the site ignores mldate and serves today, which
 // would otherwise be filed under the future date as if it were real.
 if (meta.date !== date) return null;

 const menus = emptyMenus();
 for (const meal of MEAL_PLAN) {
 const menuGuid = meta.mealIds[meal.label];
 if (!menuGuid) continue;

 const mealHtml = await fetchHtml(buildMenuUrl({ locationGuid, date, menuGuid }));
 menus[meal.key] = {
 classicKitchen: extractSectionItems(mealHtml, "Classic Kitchen"),
 globalFare: extractSectionItems(mealHtml, "Global Fare")
 };
 }

 return countItems(menus) > 0 ? menus : null;
}

function addDays(date, days) {
 const d = new Date(`${date}T12:00:00Z`);
 d.setUTCDate(d.getUTCDate() + days);
 return d.toISOString().slice(0, 10);
}

async function readExisting() {
 try {
 return JSON.parse(await fs.readFile(OUT, "utf8"));
 } catch {
 return null;
 }
}

async function main() {
 const baseHtml = await fetchHtml(MENU_URL);
 const baseMeta = parseBaseMeta(baseHtml);
 const { date, locationGuid } = baseMeta;

 const existing = await readExisting();
 const previousDays = existing?.days && typeof existing.days === "object" ? existing.days : {};
 const daysAge = existing?.daysUpdatedAt
 ? Date.now() - Date.parse(existing.daysUpdatedAt)
 : Number.POSITIVE_INFINITY;
 const refreshFuture = !(daysAge < FUTURE_MAX_AGE_MS);

 const todayMenus = await fetchMenusForDate(date, locationGuid, baseMeta);
 if (!todayMenus) {
 console.log("No target section items parsed. Keep existing menu.json");
 return;
 }

 const days = { [date]: todayMenus };
 for (let offset = 1; offset <= DAYS_AHEAD; offset += 1) {
 const target = addDays(date, offset);
 if (!refreshFuture) {
 // Carry yesterday's answer forward rather than asking again.
 if (previousDays[target]) days[target] = previousDays[target];
 continue;
 }
 const menus = await fetchMenusForDate(target, locationGuid);
 if (menus) days[target] = menus;
 }

 const payload = {
 updatedAt: new Date().toISOString(),
 source: "menus.tenkites.com",
 // menuDate and menus describe today. Versions of the extension released
 // before the day picker read only these two, so they stay put.
 menuDate: date,
 menus: todayMenus,
  daysUpdatedAt: refreshFuture ? new Date().toISOString() : existing?.daysUpdatedAt,
 days
 };

 await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
 console.log(
 `menu.json updated (${Object.keys(days).length} days, future ${refreshFuture ? "refreshed" : "carried over"})`
 );
}

main().catch((err) => {
 console.error(err);
 process.exit(1);
});
