import path from "node:path";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import pptxgen from "pptxgenjs";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Aaditya Sah";
pptx.company = "Chase";
pptx.subject = "Bolna × YC Symphony finale pitch";
pptx.title = "Chase finale pitch";
pptx.theme = {
  headFontFace: "Helvetica Neue",
  bodyFontFace: "Helvetica Neue",
};

const root = process.cwd();
const asset = (name: string) => path.join(root, "docs", "assets", name);
const white = "F8FAFC";
const muted = "94A3B8";
const saffron = "F59E0B";
const emerald = "10B981";

function addEyebrow(slide: pptxgen.Slide, text: string) {
  slide.addText(text.toUpperCase(), {
    x: 0.62,
    y: 0.42,
    w: 5.5,
    h: 0.26,
    fontFace: "Helvetica Neue",
    fontSize: 11,
    bold: true,
    color: saffron,
    charSpacing: 1.8,
    margin: 0,
  });
}

function addTitle(
  slide: pptxgen.Slide,
  text: string,
  options: { y?: number; w?: number; size?: number } = {},
) {
  slide.addText(text, {
    x: 0.62,
    y: options.y ?? 0.92,
    w: options.w ?? 6.1,
    h: 1.45,
    fontFace: "Helvetica Neue",
    fontSize: options.size ?? 36,
    bold: true,
    color: white,
    breakLine: false,
    fit: "shrink",
    margin: 0,
    valign: "middle",
  });
}

function addBody(
  slide: pptxgen.Slide,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size = 20,
  color = muted,
) {
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontFace: "Helvetica Neue",
    fontSize: size,
    color,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    valign: "middle",
    paraSpaceAfter: 10,
  });
}

function addScreenshot(
  slide: pptxgen.Slide,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  slide.addImage({ path: asset(name), x, y, w, h, transparency: 0 });
}

// 1. Problem
{
  const slide = pptx.addSlide();
  slide.background = { color: "07111F" };
  addEyebrow(slide, "The problem");
  addTitle(slide, "Indian SMB credit still runs on the owner’s follow-up", {
    w: 5.45,
    size: 34,
  });
  addBody(
    slide,
    "The ledger knows who owes money. The owner still decides who to chase, makes the call, sends the link and remembers every promise.",
    0.65,
    3.05,
    4.9,
    1.35,
    18,
    "CBD5E1",
  );
  addBody(
    slide,
    "Voice AI can make the call. The operating work around it is still missing.",
    0.65,
    5.02,
    4.9,
    1.0,
    20,
    white,
  );
  addScreenshot(slide, "command-center.png", 6.05, 0.78, 6.72, 3.78);
  addBody(
    slide,
    "24 fictional debtors · ₹11,33,200 outstanding in the reset demo",
    6.1,
    4.86,
    6.6,
    0.5,
    14,
    muted,
  );
  addBody(slide, "CHASE", 11.6, 6.72, 1.1, 0.25, 10, saffron);
  slide.addNotes(
    "Demo figures are from the committed fictional portfolio after pnpm demo:reset. They are not customer traction.",
  );
}

// 2. Live demo
{
  const slide = pptx.addSlide();
  slide.background = { color: "07111F" };
  addEyebrow(slide, "Live demo");
  addTitle(
    slide,
    "One call. Payment action, restraint and a queue that learns.",
    { w: 11.5, size: 30 },
  );
  addScreenshot(slide, "stage-hero.png", 0.65, 2.42, 12.05, 4.04);
  addBody(
    slide,
    "Bolna speaks Hinglish. Chase controls the account, tools and conduct.",
    0.68,
    6.72,
    9.4,
    0.35,
    16,
    "CBD5E1",
  );
  slide.addNotes(
    "Demo flow: identity before dues, broken-promise recall, ₹2,000 payment link, 9 pm callback block, rating move, owner brief.",
  );
}

// 3. How it works
{
  const slide = pptx.addSlide();
  slide.background = { color: "07111F" };
  addEyebrow(slide, "How it works");
  addTitle(slide, "Chase is the control layer around every Bolna execution", {
    w: 11.8,
    size: 32,
  });
  const steps = [
    [
      "01",
      "Rank",
      "A deterministic Chase Rating prioritises cash, urgency and effort.",
    ],
    [
      "02",
      "Gate",
      "R1–R11 decides whether contact is allowed before any dispatch.",
    ],
    [
      "03",
      "Act",
      "Seven authenticated tools turn conversation into durable work.",
    ],
    [
      "04",
      "Learn",
      "Claude updates the dossier, rating, owner brief and prompt evidence.",
    ],
  ];
  steps.forEach(([number, label, copy], index) => {
    const y = 2.45 + index * 1.08;
    addBody(slide, number, 0.7, y, 0.5, 0.38, 16, saffron);
    addBody(slide, label, 1.32, y - 0.04, 1.25, 0.42, 20, white);
    addBody(slide, copy, 2.45, y - 0.06, 3.35, 0.65, 15, "CBD5E1");
  });
  addScreenshot(slide, "command-center.png", 6.3, 1.66, 6.4, 3.6);
  addBody(
    slide,
    "Next.js · Neon · Claude · Bolna · WhatsApp/console · hosted UPI/Razorpay test",
    6.35,
    5.55,
    6.15,
    0.7,
    15,
    muted,
  );
  slide.addNotes(
    "Architecture is one Next.js application in Vercel bom1 with Postgres as the source of truth and SWR polling.",
  );
}

// 4. Why now
{
  const slide = pptx.addSlide();
  slide.background = { color: "07111F" };
  addEyebrow(slide, "Why now");
  addTitle(
    slide,
    "Voice quality is ready. The improvement loop was the missing piece.",
    { w: 11.8, size: 35 },
  );
  addScreenshot(slide, "prompt-prs.png", 0.65, 2.15, 6.15, 3.46);
  addBody(
    slide,
    "Bolna handles multilingual calling and execution.",
    7.3,
    2.38,
    4.9,
    0.7,
    21,
    white,
  );
  addBody(
    slide,
    "Claude turns outcomes into typed evidence, then proposes a small prompt diff.",
    7.3,
    3.35,
    4.9,
    0.9,
    19,
    "CBD5E1",
  );
  addBody(
    slide,
    "Eight personas test the base and candidate. Any compliance regression blocks recommendation.",
    7.3,
    4.62,
    4.9,
    1.0,
    19,
    "CBD5E1",
  );
  addBody(
    slide,
    "Human approval stays in the loop.",
    7.3,
    6.08,
    4.9,
    0.48,
    18,
    emerald,
  );
  slide.addNotes(
    "The Prompt PR shown is a seeded, evidence-linked demo proposal. Protected compliance sections cannot be edited.",
  );
}

// 5. Business model
{
  const slide = pptx.addSlide();
  slide.background = { color: "07111F" };
  addEyebrow(slide, "Business model");
  addTitle(
    slide,
    "Charge for active accounts. Win when the customer collects.",
    { w: 10.8, size: 40 },
  );
  addBody(slide, "PLATFORM", 0.72, 2.72, 2.1, 0.34, 12, saffron);
  addBody(
    slide,
    "Monthly fee per active account",
    0.72,
    3.18,
    5.0,
    0.75,
    28,
    white,
  );
  addBody(
    slide,
    "Covers ranking, conduct controls, agent tools, operator console and management brief.",
    0.72,
    4.12,
    5.0,
    1.05,
    18,
    "CBD5E1",
  );
  addBody(slide, "OUTCOME", 6.95, 2.72, 2.1, 0.34, 12, emerald);
  addBody(slide, "A share of recovered dues", 6.95, 3.18, 5.0, 0.75, 28, white);
  addBody(
    slide,
    "Aligns pricing with cash received while keeping simulated and test-mode money outside billing.",
    6.95,
    4.12,
    5.0,
    1.05,
    18,
    "CBD5E1",
  );
  addBody(
    slide,
    "Start with distributors and wholesalers that already export receivables from Tally or spreadsheets.",
    0.72,
    6.22,
    11.5,
    0.55,
    18,
    muted,
  );
  slide.addNotes(
    "No price point or production revenue is claimed. The requested model is a monthly fee per active account plus a share of recovered dues.",
  );
}

// 6. Ask
{
  const slide = pptx.addSlide();
  slide.background = { color: "07111F" };
  addEyebrow(slide, "The ask");
  addTitle(
    slide,
    "Pilot Chase with a distributor whose owner still runs collections by phone",
    { y: 1.2, w: 10.9, size: 42 },
  );
  addBody(
    slide,
    "We want paid design partners and channel introductions into Indian distribution.",
    0.7,
    3.25,
    8.5,
    0.9,
    24,
    "CBD5E1",
  );
  addBody(slide, "Bolna makes the call.", 0.7, 5.25, 5.2, 0.65, 31, white);
  addBody(slide, "Chase gets you paid.", 0.7, 5.92, 5.7, 0.7, 31, saffron);
  addBody(slide, "chase-liard.vercel.app", 9.2, 6.32, 3.3, 0.35, 14, emerald);
  slide.addNotes(
    "Close after the owner brief call. The public read-only passcode must be provided separately once configured.",
  );
}

async function exportPitch() {
  const finalPath = path.join(root, "docs", "Chase-finale-pitch.pptx");
  await pptx.writeFile({ fileName: finalPath });
  // PptxGenJS 4 emits stale content-type entries for unused slide masters.
  // Repair only those orphan declarations so strict package validation passes.
  const unpacked = await mkdtemp(path.join(tmpdir(), "chase-pitch-"));
  const repaired = path.join(root, "docs", ".Chase-finale-pitch-repaired.pptx");
  try {
    const unzip = spawnSync("unzip", ["-q", finalPath, "-d", unpacked]);
    if (unzip.status !== 0) throw new Error("PPTX unpack failed");
    const contentTypesPath = path.join(unpacked, "[Content_Types].xml");
    const contentTypes = await readFile(contentTypesPath, "utf8");
    await writeFile(
      contentTypesPath,
      contentTypes.replace(
        /<Override PartName="\/ppt\/slideMasters\/slideMaster[2-9][0-9]*\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.slideMaster\+xml"\/>/g,
        "",
      ),
    );
    const zip = spawnSync("zip", ["-qr", repaired, "."], { cwd: unpacked });
    if (zip.status !== 0) throw new Error("PPTX repack failed");
    await rename(repaired, finalPath);
  } finally {
    await rm(unpacked, { recursive: true, force: true });
    await rm(repaired, { force: true });
  }
  console.log("Built the six-slide editable finale pitch.");
}

void exportPitch().catch(() => {
  console.error("Pitch export failed.");
  process.exitCode = 1;
});
