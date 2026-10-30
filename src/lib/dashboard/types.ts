export type GateRuleView = { id: string; passed: boolean; detail: string };
export type QueueItem = {
  rank: number;
  debtorId: string;
  shopName: string;
  contactName: string;
  language: "hi" | "en" | "mr";
  status: string;
  outstandingPaise: string;
  daysPastDue: number;
  score: number | null;
  scoreDelta: number;
  band: "A" | "B" | "C" | "D" | "X";
  pPay7d: number | null;
  components: Record<string, number>;
  nextAction: string;
  reasons: string[];
  rationale: string;
  allowed: boolean;
  rules: GateRuleView[];
  nextAllowedAt: string | null;
  demoDebtor: boolean;
};

export type DashboardEvent = {
  id: string;
  type: string;
  debtorId: string | null;
  callId: string | null;
  shopName: string | null;
  payload: Record<string, unknown>;
  at: string;
};

export type LiveCall = {
  id: string;
  debtorId: string;
  shopName: string;
  contactName: string;
  status: string;
  connected: boolean;
  startedAt: string | null;
  endedAt: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  ownerSummary: string | null;
  paymentToken: string | null;
  paymentStatus: string | null;
  events: DashboardEvent[];
  messages: Array<{
    id: string;
    direction: "in" | "out";
    channel: string;
    provider: string;
    body: string;
    status: string;
    at: string;
  }>;
};

export type DashboardSummary = {
  business: {
    id: string;
    name: string;
    demoOverride: boolean;
    window: string;
  };
  meta: {
    demoMode: boolean;
    agentMode: string;
    llmProvider: string;
    llmModel: string;
    today: string;
  };
  kpis: {
    outstandingPaise: string;
    debtorCount: number;
    promisedTodayPaise: string;
    collectedTodayPaise: string;
    simulatedCollectedTodayPaise: string;
    callsAttempted: number;
    callsConnected: number;
    connectRate: number;
    blocked: number;
    optOuts: number;
  };
  liveCall: LiveCall | null;
  latestGateBlock: {
    rule: string;
    detail: Record<string, unknown>;
    shopName: string | null;
    at: string;
  } | null;
};
