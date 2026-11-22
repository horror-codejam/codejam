import specialEliteLicense from "../../../assets/fonts/LICENSE-SpecialElite.txt?url";
import vt323License from "../../../assets/fonts/OFL.txt?url";
import { after } from "./timing";

type Credit = [asset: string, creator: string, source?: string, license?: string];

const TEAM = ["Yacine", "Vidush", "Siqi"];

// Watch-room attributions from scenes/03-watch-room/CREDITS.md.
const ASSETS: Credit[] = [
  ["Office Chair", "artvolodskikh", "https://sketchfab.com/3d-models/office-chair-a7fefb5dde954c84896949246dde5be6", "CC BY, adapted scale and materials"],
  ["Lantern 01", "Rajil Jose Macatangay", "https://polyhaven.com/a/Lantern_01", "CC0"],
  ["Wooden Crate 01", "James Ray Cock", "https://polyhaven.com/a/wooden_crate_01", "CC0"],
  ["Metal Toolbox", "Mateusz Sadek", "https://polyhaven.com/a/metal_toolbox", "CC0"],
  ["Wooden Crate 02", "James Ray Cock and Jurita Burger", "https://polyhaven.com/a/wooden_crate_02", "CC0"],
  ["Boulder 01", "Rico Cilliers", "https://polyhaven.com/a/boulder_01", "CC0"],
  ["Rock Face 02", "Dario Barresi and Rico Cilliers", "https://polyhaven.com/a/rock_face_02", "CC0"],
  ["Rusty Metal 03", "Amal Kumar", "https://polyhaven.com/a/rusty_metal_03", "CC0"],
  ["First Person hands rigged", "David Fischer", "https://sketchfab.com/3d-models/first-person-hands-rigged-547a45535f0c4fe787948f7a7a6a88db", "CC BY 4.0, adapted scale, materials and poses"],
  // Sketchfab base FBX 3f679e25181e46fcadd1442756f1091c: source author and license pending confirmation.
  ["Character model", "Vidush Komarraju"],
  // Ending stills, from art/end-cutscene/ASSET-CREDITS.md.
  ["Concrete Floor 02", "Rob Tuytel", "https://polyhaven.com/a/concrete_floor_02", "CC0"],
  ["Industrial Caged Sconce", "Ulan Cabanilla", "https://polyhaven.com/a/industrial_caged_sconce", "CC0"],
  ["Coast Rocks 02", "Rob Tuytel and Rico Cilliers", "https://polyhaven.com/a/coast_rocks_02", "CC0"],
  ["Rock Boulder Cracked", "Poly Haven", "https://polyhaven.com/a/rock_boulder_cracked", "CC0"],
  ["Lifebuoy", "Hank Kaamura", "https://polyhaven.com/a/lifebuoy", "CC0"],
];

const FONTS = [
  { name: "Special Elite", file: "LICENSE-SpecialElite.txt", url: specialEliteLicense },
  { name: "VT323", file: "OFL.txt", url: vt323License },
];

const CREDITS_DURATION = 26_000;

export function renderEnding(screen: HTMLElement, title: () => void, signal: AbortSignal): void {
  screen.dataset.screen = "ending";
  screen.innerHTML = '<p class="ending screen-reveal">You get out.<br>Behind you, the puppets move.<br>Your cage is empty.</p>';
  after(5200, signal, () => renderCredits(screen, title, signal));
}

export function renderCredits(screen: HTMLElement, title: () => void, signal: AbortSignal): void {
  screen.dataset.screen = "credits";
  const roll = document.createElement("div");
  roll.className = "credits-roll";
  roll.style.setProperty("--credits-duration", `${CREDITS_DURATION}ms`);

  const team = document.createElement("div");
  team.className = "credit-group";
  for (const name of TEAM) {
    const row = document.createElement("p");
    row.className = "credit-row";
    row.textContent = name;
    team.append(row);
  }
  const assets = document.createElement("div");
  assets.className = "credit-group assets";
  assets.append(...ASSETS.map(creditRow));
  for (const { name, file, url } of FONTS) {
    const row = document.createElement("p");
    row.className = "credit-row";
    const link = document.createElement("a");
    link.className = "font-license";
    link.href = url;
    link.download = file;
    link.textContent = file;
    row.append(`${name} / `, link);
    assets.append(row);
  }
  roll.append(team, assets);
  screen.replaceChildren(roll);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  after(reducedMotion ? 14_000 : CREDITS_DURATION, signal, title);
}

function creditRow([asset, creator, source, license]: Credit): HTMLElement {
  const row = document.createElement("p");
  row.className = "credit-row";
  if (source) {
    const link = document.createElement("a");
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = asset;
    row.append(link);
  } else {
    row.append(asset);
  }
  row.append(` / ${creator}`);
  if (license) row.append(` / ${license}`);
  return row;
}
