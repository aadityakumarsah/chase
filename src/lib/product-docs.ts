export type DocBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: { title: string; text: string }[] }
  | { kind: "code"; label: string; code: string }
  | { kind: "note"; title: string; text: string }
  | { kind: "flow"; variant: "overview" | "rating" | "call" };

export type DocSection = { id: string; title: string; blocks: DocBlock[] };
export type ProductDoc = {
  slug: string;
  group: string;
  title: string;
  description: string;
  eyebrow: string;
  sections: DocSection[];
};

export const productDocs: ProductDoc[] = [
  {
    slug: "overview",
    group: "Start here",
    title: "Meet Chase",
    eyebrow: "PRODUCT GUIDE / 01",
    description: "From an unpaid invoice to a respectful, trackable follow-up.",
    sections: [
      {
        id: "what-chase-does",
        title: "What Chase does",
        blocks: [
          {
            kind: "text",
            text: "Chase helps an Indian business manage overdue invoices. It ranks the next accounts to contact, supplies context to a Bolna voice agent, records what happened, and shows the owner what needs attention. Bolna runs the conversation; Chase owns the receivables workflow around it.",
          },
          { kind: "flow", variant: "overview" },
          {
            kind: "note",
            title: "Two different payments",
            text: "A customer paying your invoice pays your business directly through its configured UPI or Razorpay flow. A Pro subscription pays Chase through Dodo Payments. They never share a checkout or a ledger.",
          },
        ],
      },
      {
        id: "your-workspace",
        title: "Your workspace",
        blocks: [
          {
            kind: "text",
            text: "One workspace represents one business. Your dashboard combines the call queue, debtor accounts, conversations, conduct decisions, owner briefs, and AI improvement proposals. The owner controls billing and team invitations.",
          },
          {
            kind: "list",
            items: [
              "Dashboard: today’s queue, money and live activity.",
              "Debtors: invoice balances, history and Contact Dossier.",
              "Calls and Compliance: conversation evidence and why a call was allowed or blocked.",
              "Brief and AI Ops: daily summary, model activity and prompt proposals.",
            ],
          },
        ],
      },
      {
        id: "honest-demo",
        title: "Understand the demo labels",
        blocks: [
          {
            kind: "text",
            text: "The public landing-page walkthrough is illustrative. A console message, sample account, or simulated payment is labelled as such. It does not mean a WhatsApp message was delivered or money moved. Real calls and delivery require provider configuration and the contact gate.",
          },
        ],
      },
    ],
  },
  {
    slug: "quickstart",
    group: "Start here",
    title: "Get started",
    eyebrow: "PRODUCT GUIDE / 02",
    description:
      "Create a workspace and get your first receivables queue ready.",
    sections: [
      {
        id: "create-workspace",
        title: "1. Create your workspace",
        blocks: [
          {
            kind: "steps",
            items: [
              {
                title: "Create an account",
                text: "Sign up with email or Google, then complete the sign-in flow.",
              },
              {
                title: "Name the business",
                text: "Create a workspace for the business whose invoices you manage.",
              },
              {
                title: "Set business details",
                text: "Add the display name and merchant UPI details used on customer payment links.",
              },
              {
                title: "Verify the owner phone",
                text: "Verify the owner number before enabling a voice management brief.",
              },
            ],
          },
          {
            kind: "note",
            title: "During a demo",
            text: "A demo-mode installation can dial only numbers explicitly in its server allowlist, including an owner number. An empty allowlist blocks every dial.",
          },
        ],
      },
      {
        id: "bring-invoices",
        title: "2. Bring your invoices",
        blocks: [
          {
            kind: "text",
            text: "Open Debtors and upload a CSV export from your ledger. Chase imports valid rows and shows rejected row numbers afterward. It uses invoice amounts, due dates and contact history to prepare the queue. Importing attests that the business has a valid contact basis for those customers.",
          },
          {
            kind: "list",
            items: [
              "Use Indian mobile numbers that can be normalized to E.164 format.",
              "Enter invoice amounts in rupees in the CSV; Chase stores integer paise internally.",
              "Record a truthful contact-consent basis for live calling.",
              "Review skipped rows and fix them before retrying.",
            ],
          },
        ],
      },
      {
        id: "first-review",
        title: "3. Review before contact",
        blocks: [
          {
            kind: "text",
            text: "Check the ranked queue, open an account dossier, and inspect the call eligibility reason. Use the Lab for a browser practice conversation before a phone rehearsal. Only an explicit action can begin a call; simply opening the dashboard never dials anyone.",
          },
        ],
      },
    ],
  },
  {
    slug: "importing-invoices",
    group: "Operate",
    title: "Import invoices",
    eyebrow: "OPERATE / 01",
    description: "Turn a ledger export into accounts Chase can understand.",
    sections: [
      {
        id: "prepare-csv",
        title: "Prepare a CSV",
        blocks: [
          {
            kind: "text",
            text: "The importer requires the nine headers shown below. Save the file as UTF-8 CSV, with one invoice per row. Amounts are rupees, dates use YYYY-MM-DD or DD-MM-YYYY, and language is hi, en or mr.",
          },
          {
            kind: "code",
            label: "CSV import format",
            code: "shop_name,contact_name,phone,language,invoice_no,invoice_date,due_date,amount_rupees,paid_rupees\nSharma General Store,Suresh,9000000015,hi,INV-1042,2026-10-01,2026-11-05,12500,0",
          },
          {
            kind: "note",
            title: "Before you import",
            text: "The example phone is fictional. Use only customer data your business is authorized to contact. The importer accepts at most 1,000 rows and a file under 2 MiB. Uploading immediately imports valid rows; there is no separate confirmation step.",
          },
        ],
      },
      {
        id: "review-results",
        title: "Review the results",
        blocks: [
          {
            kind: "steps",
            items: [
              { title: "Upload", text: "Choose a UTF-8 CSV file in Debtors." },
              {
                title: "Inspect",
                text: "After upload, review the imported count and reasons for rejected rows.",
              },
              {
                title: "Correct",
                text: "Fix phone, dates or amounts in the source file. Confirm the business has a valid contact basis before importing.",
              },
              {
                title: "Verify",
                text: "Check an imported account’s invoices and rating in Debtors.",
              },
            ],
          },
        ],
      },
      {
        id: "keep-current",
        title: "Keep balances current",
        blocks: [
          {
            kind: "text",
            text: "Re-importing an invoice from the same business updates its record rather than creating a second copy. Check the debtor timeline after an import to confirm the latest balance and any recorded payment or dispute.",
          },
        ],
      },
    ],
  },
  {
    slug: "chase-rating",
    group: "Operate",
    title: "The Chase Rating",
    eyebrow: "OPERATE / 02",
    description:
      "Know why an account is next, and whether it can be contacted.",
    sections: [
      {
        id: "how-ranking-works",
        title: "How ranking works",
        blocks: [
          {
            kind: "text",
            text: "The 0–100 rating is calculated deterministically from payment likelihood, balance, urgency and expected contact effort. Claude can explain observed features in one line, but it does not choose the numeric score.",
          },
          { kind: "flow", variant: "rating" },
          {
            kind: "note",
            title: "Rating is not permission",
            text: "A high rating never overrides opt-outs, consent, call hours, attempt caps, open disputes or other contact rules. The queue shows both priority and the gate decision.",
          },
        ],
      },
      {
        id: "read-queue",
        title: "Read the queue",
        blocks: [
          {
            kind: "list",
            items: [
              "Open Dashboard for the current ranked list and explanation.",
              "Open a debtor to see invoices, prior promises and contact history.",
              "Check the next allowed time when an account is blocked today.",
              "Use a campaign dry run to see candidates and reasons before any live dispatch.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "calls-and-conduct",
    group: "Operate",
    title: "Calls & conduct",
    eyebrow: "OPERATE / 03",
    description:
      "Follow up with context, clear limits and an auditable decision.",
    sections: [
      {
        id: "call-journey",
        title: "The call journey",
        blocks: [
          { kind: "flow", variant: "call" },
          {
            kind: "steps",
            items: [
              {
                title: "Check eligibility",
                text: "Chase evaluates the contact gate and records its decision.",
              },
              {
                title: "Call with context",
                text: "Bolna opens with AI disclosure, confirms identity, then may discuss the invoice using dossier context.",
              },
              {
                title: "Act during the call",
                text: "The agent can request a payment link, record a promise, log a dispute or opt-out, and schedule an allowed callback.",
              },
              {
                title: "Review the outcome",
                text: "After a completed execution, Chase analyzes the conversation, updates the dossier and refreshes the queue.",
              },
            ],
          },
        ],
      },
      {
        id: "contact-rules",
        title: "Contact rules",
        blocks: [
          {
            kind: "text",
            text: "The default debtor calling window is 09:00–18:30 IST within hard 08:00–19:00 limits. The gate also considers Sundays, attempt caps, minimum gaps, promises, disputes, opt-outs and consent. A 21:00 callback request is logged as blocked and moved to the next allowed slot.",
          },
          {
            kind: "note",
            title: "Respect first",
            text: "Only a confirmed recipient may hear debt details. The agent identifies itself as AI. These are engineering safeguards; they are not a legal certification.",
          },
        ],
      },
      {
        id: "review-evidence",
        title: "Review evidence",
        blocks: [
          {
            kind: "text",
            text: "The Calls page shows lifecycle, transcript, tool actions and analysis when available. Compliance shows the rule decision and audit trail. A disconnected call is not treated as a completed analysis until Bolna sends the final execution.",
          },
        ],
      },
    ],
  },
  {
    slug: "payments-and-promises",
    group: "Operate",
    title: "Payments & promises",
    eyebrow: "OPERATE / 04",
    description:
      "Give the customer a clear next step and keep the invoice ledger honest.",
    sections: [
      {
        id: "payment-link",
        title: "Send a payment link",
        blocks: [
          {
            kind: "text",
            text: "During an eligible call, the agent can request a hosted UPI link for an amount the customer agrees to pay. Depending on your messaging setup, it is delivered through WhatsApp/SMS or shown as a clearly labelled console simulation. The public pay page displays the business payee, amount and UPI QR.",
          },
          {
            kind: "note",
            title: "Confirmation matters",
            text: "Opening a link or returning from a payment page does not prove payment. A verified Razorpay event or an explicitly labelled demo simulation updates the ledger. Never treat a console message as delivered WhatsApp.",
          },
        ],
      },
      {
        id: "promise",
        title: "Record a dated promise",
        blocks: [
          {
            kind: "text",
            text: "The agent records an agreed amount and date, with a reason when given. Chase uses this commitment to avoid unnecessary follow-ups and flags a broken promise when its due time passes without the recorded payment.",
          },
          {
            kind: "list",
            items: [
              "Promises and payments appear on the debtor timeline.",
              "A partial payment reduces the outstanding invoice balance.",
              "Disputes and opt-outs place protective contact holds.",
              "Callbacks are checked against the same contact rules as manual calls.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "brief-and-ai",
    group: "Intelligence",
    title: "Brief & AI Ops",
    eyebrow: "INTELLIGENCE / 01",
    description:
      "Understand the day and review improvements before they go live.",
    sections: [
      {
        id: "daily-brief",
        title: "Daily management brief",
        blocks: [
          {
            kind: "text",
            text: "At the scheduled 19:15 IST run, Chase compiles calls, promises, collected amounts, broken commitments, disputes and tomorrow’s priority queue for each workspace. The brief appears in the dashboard; configured delivery may message or call the verified owner.",
          },
          {
            kind: "note",
            title: "Owner calls are different",
            text: "An owner management brief is not a debtor collection call. In demo mode, the owner number must still be on the call allowlist.",
          },
        ],
      },
      {
        id: "prompt-prs",
        title: "Prompt proposals",
        blocks: [
          {
            kind: "text",
            text: "Chase can propose a small change to an agent prompt based on losing conversations, with linked evidence and persona simulator results. The owner reviews the diff. Protected conduct language cannot be removed by a proposal.",
          },
          {
            kind: "list",
            items: [
              "Review the cited calls and the before/after text.",
              "Compare simulator outcomes and conduct checks.",
              "Approve only when the workspace is authorized for agent sync; shared agent activation is restricted in multi-tenant SaaS.",
              "Reject a proposal that lacks evidence or worsens the conversation.",
            ],
          },
        ],
      },
      {
        id: "model-activity",
        title: "Model activity",
        blocks: [
          {
            kind: "text",
            text: "AI Ops shows routing, latency, tokens and available cost estimates. Some estimates remain unavailable when provider prices are not configured. The model helps interpret a conversation; durable tool records remain the source of truth for payments and promises.",
          },
        ],
      },
    ],
  },
  {
    slug: "plans-and-team",
    group: "Workspace",
    title: "Plans & team",
    eyebrow: "WORKSPACE / 01",
    description:
      "Choose a plan, invite collaborators and understand who can act.",
    sections: [
      {
        id: "plans",
        title: "Choose a plan",
        blocks: [
          {
            kind: "text",
            text: "Free lets a small business begin without a card. Pro adds higher account, call and seat limits plus campaigns, briefs and Prompt PR review. The displayed Pro price is ₹2,499/month or ₹24,990/year before applicable tax. Enterprise is a sales conversation, not an automatic checkout.",
          },
          {
            kind: "note",
            title: "Billing confirmation",
            text: "Only the workspace owner can start Dodo checkout or open the customer portal in Settings → Billing. Chase activates Pro after Dodo sends a verified subscription event, not when the browser returns from checkout.",
          },
        ],
      },
      {
        id: "invite-team",
        title: "Invite your team",
        blocks: [
          {
            kind: "text",
            text: "The owner can invite teammates from Settings → Team within the plan’s seat limit. Invitations are bound to an email address and expire after 72 hours. Where email delivery is not configured, copy the generated invitation link and share it privately.",
          },
        ],
      },
      {
        id: "cancel",
        title: "Manage a subscription",
        blocks: [
          {
            kind: "text",
            text: "Use Settings → Billing to open Dodo’s customer portal for payment methods, invoices and cancellation. Existing workspace data remains readable after a downgrade; new over-limit actions are blocked until usage fits the current plan.",
          },
        ],
      },
    ],
  },
  {
    slug: "integrations-and-help",
    group: "Workspace",
    title: "Integrations & help",
    eyebrow: "WORKSPACE / 02",
    description:
      "What connects to Chase, and where to look when something stops.",
    sections: [
      {
        id: "connected-services",
        title: "Connected services",
        blocks: [
          {
            kind: "list",
            items: [
              "Bolna powers the voice agent and sends call execution events.",
              "The configured LLM interprets outcomes and compiles account context.",
              "Meta/Twilio can deliver messages; console mode is a visible simulation.",
              "Your UPI VPA or configured Razorpay flow handles customer invoice payments.",
              "Dodo handles the workspace’s Chase subscription.",
            ],
          },
          {
            kind: "note",
            title: "For workspace owners",
            text: "The Settings page reports which services are configured. Sensitive server credentials are never shown to workspace users. A service marked missing requires the Chase operator to configure it.",
          },
        ],
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        blocks: [
          {
            kind: "steps",
            items: [
              {
                title: "A call is blocked",
                text: "Open its gate reason in Dashboard or Compliance. Check consent, call hours, opt-out, attempt limits and demo allowlisting.",
              },
              {
                title: "A message did not arrive",
                text: "Check whether the workspace uses a real messaging provider or console simulation, then inspect delivery status.",
              },
              {
                title: "Payment is pending",
                text: "A link open is not payment. Check the verified provider confirmation or the clearly marked demo simulation.",
              },
              {
                title: "Pro is not active",
                text: "Check Settings → Billing after checkout. The signed Dodo event must arrive before the plan changes.",
              },
            ],
          },
        ],
      },
      {
        id: "developer-boundary",
        title: "About the service endpoints",
        blocks: [
          {
            kind: "text",
            text: "Chase currently exposes authenticated service endpoints for Bolna tools, payment webhooks and scheduled jobs. They are internal integration surfaces, not a public customer API. Do not call them from a browser or put their secrets in client-side code.",
          },
          {
            kind: "code",
            label: "Conceptual event flow",
            code: "Bolna call → Chase tool action → payment / promise / callback\nBolna completed event → typed analysis → dossier → rating\nDodo signed subscription event → workspace plan",
          },
        ],
      },
    ],
  },
];

export function findProductDoc(slug: string): ProductDoc | undefined {
  return productDocs.find((doc) => doc.slug === slug);
}
