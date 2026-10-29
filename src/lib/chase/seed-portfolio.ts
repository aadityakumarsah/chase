import type { RatingInput } from "./rating";
export const DEMO_SEED_KEY = "chase-demo-v2";
export type SeedProfile = {
  shop: string;
  contact: string;
  city: string;
  segment: "kirana" | "medical" | "restaurant" | "hardware";
  language: "hi" | "en" | "mr";
  outstanding: number;
  dpd: number;
  kind:
    | "demo"
    | "dispute"
    | "optout"
    | "hardship"
    | "wrong"
    | "reliable"
    | "breaker"
    | "unanswered"
    | "ordinary"
    | "promise";
  historyDays: number[];
  reason: RatingInput["reason_code"];
  sentiment: RatingInput["sentiment"];
};
const profiles: Omit<SeedProfile, "language">[] = [
  {
    shop: "Sharma General Store",
    contact: "Suresh Sharma",
    city: "Pune",
    segment: "kirana",
    outstanding: 12500,
    dpd: 34,
    kind: "demo",
    historyDays: [6],
    reason: "salary_delay",
    sentiment: "neutral",
  },
  {
    shop: "Gupta Provision Mart",
    contact: "Mahesh Gupta",
    city: "Pimpri",
    segment: "kirana",
    outstanding: 48000,
    dpd: 48,
    kind: "dispute",
    historyDays: [3],
    reason: "dispute",
    sentiment: "negative",
  },
  {
    shop: "Sai Medical & General",
    contact: "Neha Jain",
    city: "Wakad",
    segment: "medical",
    outstanding: 18500,
    dpd: 21,
    kind: "optout",
    historyDays: [12],
    reason: "unknown",
    sentiment: "neutral",
  },
  {
    shop: "Annapurna Bhojanalay",
    contact: "Rajesh Yadav",
    city: "Hadapsar",
    segment: "restaurant",
    outstanding: 22000,
    dpd: 65,
    kind: "hardship",
    historyDays: [9],
    reason: "hardship",
    sentiment: "neutral",
  },
  {
    shop: "Vishwakarma Hardware",
    contact: "Dinesh Verma",
    city: "Pimpri",
    segment: "hardware",
    outstanding: 3500,
    dpd: 10,
    kind: "wrong",
    historyDays: [10],
    reason: "wrong_number",
    sentiment: "neutral",
  },
  {
    shop: "Bansal Supermarket",
    contact: "Anil Bansal",
    city: "Pune",
    segment: "kirana",
    outstanding: 95000,
    dpd: 55,
    kind: "reliable",
    historyDays: [13, 11, 9],
    reason: "unknown",
    sentiment: "positive",
  },
  {
    shop: "Jeevan Medicals",
    contact: "Pooja Mishra",
    city: "Wakad",
    segment: "medical",
    outstanding: 45000,
    dpd: 25,
    kind: "reliable",
    historyDays: [13, 11, 9],
    reason: "unknown",
    sentiment: "positive",
  },
  {
    shop: "Delhi Zaika Kitchen",
    contact: "Imran Ansari",
    city: "Hadapsar",
    segment: "restaurant",
    outstanding: 75000,
    dpd: 78,
    kind: "reliable",
    historyDays: [13, 11, 9],
    reason: "salary_delay",
    sentiment: "positive",
  },
  {
    shop: "Agarwal Wholesale Mart",
    contact: "Vikas Agarwal",
    city: "Pune",
    segment: "kirana",
    outstanding: 185000,
    dpd: 42,
    kind: "reliable",
    historyDays: [13, 11, 9],
    reason: "unknown",
    sentiment: "positive",
  },
  {
    shop: "Balaji Hardware Depot",
    contact: "Mukesh Tiwari",
    city: "Pimpri",
    segment: "hardware",
    outstanding: 68000,
    dpd: 110,
    kind: "breaker",
    historyDays: [13, 10, 6, 3],
    reason: "avoidance",
    sentiment: "negative",
  },
  {
    shop: "New Bharat Stores",
    contact: "Sanjay Gupta",
    city: "Hadapsar",
    segment: "kirana",
    outstanding: 125000,
    dpd: 140,
    kind: "breaker",
    historyDays: [13, 10, 6, 3],
    reason: "cash_flow",
    sentiment: "negative",
  },
  {
    shop: "Royal Tandoor",
    contact: "Aslam Sheikh",
    city: "Wakad",
    segment: "restaurant",
    outstanding: 36000,
    dpd: 93,
    kind: "breaker",
    historyDays: [13, 10, 6, 3],
    reason: "avoidance",
    sentiment: "hostile",
  },
  {
    shop: "Om Sai Kirana",
    contact: "Ramesh Pal",
    city: "Pimpri",
    segment: "kirana",
    outstanding: 28000,
    dpd: 90,
    kind: "unanswered",
    historyDays: [13, 11, 9, 6, 3, 1],
    reason: "unknown",
    sentiment: "unknown",
  },
  {
    shop: "Shakti Hardware House",
    contact: "Ajay Singh",
    city: "Hadapsar",
    segment: "hardware",
    outstanding: 56000,
    dpd: 120,
    kind: "unanswered",
    historyDays: [13, 11, 9, 6, 3, 1],
    reason: "unknown",
    sentiment: "unknown",
  },
  {
    shop: "Green Basket Grocers",
    contact: "Asha Menon",
    city: "Wakad",
    segment: "kirana",
    outstanding: 8400,
    dpd: 5,
    kind: "ordinary",
    historyDays: [8],
    reason: "unknown",
    sentiment: "neutral",
  },
  {
    shop: "CarePlus Pharmacy",
    contact: "Arjun Nair",
    city: "Pune",
    segment: "medical",
    outstanding: 15000,
    dpd: 12,
    kind: "promise",
    historyDays: [2],
    reason: "cash_flow",
    sentiment: "positive",
  },
  {
    shop: "Urban Chai & Snacks",
    contact: "Farhan Khan",
    city: "Hadapsar",
    segment: "restaurant",
    outstanding: 32000,
    dpd: 29,
    kind: "ordinary",
    historyDays: [4],
    reason: "cash_flow",
    sentiment: "neutral",
  },
  {
    shop: "Metro Tools & Hardware",
    contact: "Kevin Dsouza",
    city: "Pimpri",
    segment: "hardware",
    outstanding: 62000,
    dpd: 50,
    kind: "ordinary",
    historyDays: [9],
    reason: "unknown",
    sentiment: "neutral",
  },
  {
    shop: "Fresh Corner Market",
    contact: "Ritu Malhotra",
    city: "Wakad",
    segment: "kirana",
    outstanding: 98000,
    dpd: 75,
    kind: "ordinary",
    historyDays: [5],
    reason: "cash_flow",
    sentiment: "neutral",
  },
  {
    shop: "Wellness Medical Shop",
    contact: "Sneha Thomas",
    city: "Pune",
    segment: "medical",
    outstanding: 7800,
    dpd: 18,
    kind: "ordinary",
    historyDays: [10],
    reason: "unknown",
    sentiment: "positive",
  },
  {
    shop: "The Lunch Box",
    contact: "Joseph Fernandes",
    city: "Hadapsar",
    segment: "restaurant",
    outstanding: 14000,
    dpd: 8,
    kind: "ordinary",
    historyDays: [3],
    reason: "unknown",
    sentiment: "neutral",
  },
  {
    shop: "Deshmukh Kirana",
    contact: "Prakash Deshmukh",
    city: "Pune",
    segment: "kirana",
    outstanding: 21000,
    dpd: 30,
    kind: "ordinary",
    historyDays: [8],
    reason: "unknown",
    sentiment: "neutral",
  },
  {
    shop: "Patil Hardware",
    contact: "Vaishali Patil",
    city: "Pimpri",
    segment: "hardware",
    outstanding: 46500,
    dpd: 58,
    kind: "ordinary",
    historyDays: [5],
    reason: "cash_flow",
    sentiment: "neutral",
  },
  {
    shop: "Mauli Upahar Gruha",
    contact: "Ganesh Jadhav",
    city: "Wakad",
    segment: "restaurant",
    outstanding: 11000,
    dpd: 95,
    kind: "ordinary",
    historyDays: [11],
    reason: "cash_flow",
    sentiment: "negative",
  },
];
export const SEED_PORTFOLIO: readonly SeedProfile[] = profiles.map((p, i) => ({
  ...p,
  historyDays: p.kind === "ordinary" ? [6, 3, 1] : p.historyDays,
  language: i < 14 ? "hi" : i < 21 ? "en" : "mr",
}));
export function profileStatus(p: SeedProfile): RatingInput["status"] {
  return p.kind === "optout"
    ? "do_not_contact"
    : p.kind === "wrong"
      ? "wrong_number"
      : ["dispute", "hardship"].includes(p.kind)
        ? (p.kind as "dispute" | "hardship")
        : "active";
}
export function fixtureRatingInput(
  p: SeedProfile,
  today = "2026-10-29",
): RatingInput {
  const future = new Date(`${today}T00:00:00Z`);
  future.setUTCDate(future.getUTCDate() + 2);
  const kept = p.kind === "reliable" ? 3 : 0;
  const broken = p.kind === "demo" ? 1 : p.kind === "breaker" ? 3 : 0;
  return {
    outstanding_rupees: p.outstanding,
    portfolio_max_outstanding_rupees: Math.max(
      ...SEED_PORTFOLIO.map((p) => p.outstanding),
    ),
    dpd: p.dpd,
    attempts_7d: p.historyDays.filter((d) => d < 7).length,
    unanswered_streak: p.kind === "unanswered" ? p.historyDays.length : 0,
    promises: {
      made: kept + broken + (p.kind === "promise" ? 1 : 0),
      kept,
      broken,
      partially_kept: 0,
    },
    active_promise:
      p.kind === "promise"
        ? { date: future.toISOString().slice(0, 10), amount: 5000 }
        : null,
    reason_code: p.reason,
    sentiment: p.sentiment,
    status: profileStatus(p),
    opted_out: p.kind === "optout",
    today,
  };
}
