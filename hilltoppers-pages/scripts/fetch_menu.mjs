import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load } from "cheerio";

const execFileAsync = promisify(execFile);

const MENU_URL = "https://menus.tenkites.com/eliorna/d0358";
const OUT = "data/menu.json";

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

async function main() {
 const baseHtml = await fetchHtml(MENU_URL);
 const { date, locationGuid, mealIds } = parseBaseMeta(baseHtml);

 const mealPlan = [
 { key: "breakfast", label: "breakfast" },
 { key: "lunch", label: "lunch" },
 { key: "dinner", label: "dinner" }
 ];

 const menus = {
 breakfast: { classicKitchen: [], globalFare: [] },
 lunch: { classicKitchen: [], globalFare: [] },
 dinner: { classicKitchen: [], globalFare: [] }
 };

 for (const meal of mealPlan) {
 const menuGuid = mealIds[meal.label];
 if (!menuGuid) continue;

 const mealHtml = await fetchHtml(buildMenuUrl({ locationGuid, date, menuGuid }));
 menus[meal.key] = {
 classicKitchen: extractSectionItems(mealHtml, "Classic Kitchen"),
 globalFare: extractSectionItems(mealHtml, "Global Fare")
 };
 }

 const totalItems = mealPlan.reduce((sum, meal) => {
 const item = menus[meal.key];
 return sum + item.classicKitchen.length + item.globalFare.length;
 }, 0);

 if (!totalItems) {
 console.log("No target section items parsed. Keep existing menu.json");
 return;
 }

 const payload = {
 updatedAt: new Date().toISOString(),
 source: "menus.tenkites.com",
 menuDate: date,
 menus
 };

 await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
 console.log("menu.json updated");
}

main().catch((err) => {
 console.error(err);
 process.exit(1);
});
