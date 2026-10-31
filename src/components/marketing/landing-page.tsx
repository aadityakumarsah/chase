"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  FileText,
  GitPullRequest,
  HeartHandshake,
  Menu,
  MessageCircle,
  Pause,
  Phone,
  Play,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChaseBrand } from "./brand";
import { hasBolnaVoiceRecording } from "@/lib/marketing/audio-manifest";
import styles from "./marketing.module.css";
import {
  walkthroughAudioPath,
  walkthroughLines,
} from "@/lib/marketing/walkthrough";

const features = [
  {
    id: "prioritize",
    label: "Prioritize",
    icon: TrendingUp,
    title: "The right call. At the right time.",
    text: "An explainable Chase Rating ranks accounts by payment likelihood, amount and urgency. Your team starts each day knowing exactly where to focus.",
    note: "Deterministic ratings. Human-readable reasons.",
    rows: [
      ["Sharma General Store", "77", "₹12,500"],
      ["Mehta Distributors", "69", "₹28,000"],
      ["City Care Clinic", "58", "₹8,400"],
    ],
  },
  {
    id: "remember",
    label: "Remember",
    icon: Users,
    title: "Every conversation picks up where it left off.",
    text: "A Contact Dossier keeps the promises, preferences and context that matter. No asking the same questions. No losing the thread.",
    note: "Context travels with the call.",
    rows: [
      ["Last conversation", "5 Nov", "Promise to pay"],
      ["Preferred language", "HI", "Hindi / Hinglish"],
      ["Next best action", "Call", "Confirm a date"],
    ],
  },
  {
    id: "collect",
    label: "Collect",
    icon: Phone,
    title: "From a conversation to a clear next step.",
    text: "Bolna handles the voice. Chase sends a payment link, records a dated promise or schedules a callback while the conversation is still happening.",
    note: "UPI links. Dated promises. Fewer loose ends.",
    rows: [
      ["Identity confirmed", "✓", "Before invoice details"],
      ["Payment link", "UPI", "Sent during the call"],
      ["Promise recorded", "₹2,000", "With a date"],
    ],
  },
  {
    id: "protect",
    label: "Protect",
    icon: ShieldCheck,
    title: "Good conduct is part of the system.",
    text: "Calling hours, attempt caps, opt-outs and identity checks guide every collection. A request for a 9 pm callback moves to an allowed slot.",
    note: "Engineering safeguards, with a visible audit trail.",
    rows: [
      ["Requested callback", "21:00", "Outside calling hours"],
      ["Next allowed slot", "09:00", "Next eligible day"],
      ["Decision", "Logged", "Visible to the owner"],
    ],
  },
  {
    id: "brief",
    label: "Brief",
    icon: FileText,
    title: "Your day, without the spreadsheet archaeology.",
    text: "Know what was promised, what was collected and what needs you. A daily management brief brings the details together for the business owner.",
    note: "One clear picture of your receivables.",
    rows: [
      ["Promised today", "₹6,000", "3 commitments"],
      ["Collected today", "₹2,000", "Simulated example"],
      ["Needs your attention", "1", "Invoice dispute"],
    ],
  },
  {
    id: "improve",
    label: "Improve",
    icon: GitPullRequest,
    title: "Better follow-ups, one small change at a time.",
    text: "Chase learns from losing conversations, proposes a small prompt change and tests it against simulated personas. You review it before it goes live.",
    note: "Protected conduct rules stay protected.",
    rows: [
      ["Proposed change", "+1", "Ask for a specific date"],
      ["Persona checks", "Review", "Compare both versions"],
      ["Activation", "You", "Owner approval required"],
    ],
  },
];
const steps = [
  {
    label: "Connect",
    title: "A familiar conversation.",
    quote: walkthroughLines[0],
    detail: "AI disclosed · identity confirmation first",
    icon: Phone,
  },
  {
    label: "Remember",
    title: "A little context goes a long way.",
    quote: walkthroughLines[1],
    detail: "After identity confirmation · prior promise recalled",
    icon: Users,
  },
  {
    label: "Act",
    title: "A promise becomes a next step.",
    quote: walkthroughLines[2],
    detail: "Illustrative UPI link · dated promise",
    icon: Wallet,
  },
  {
    label: "Follow through",
    title: "Every outcome comes back to you.",
    quote: walkthroughLines[3],
    detail: "Simulated payment · account updated",
    icon: CircleCheck,
  },
];
const faqs = [
  [
    "What does Chase actually do?",
    "Chase helps Indian businesses follow up on unpaid invoices. It prioritizes accounts, gives a voice agent context, handles actions during the call and brings the outcome back into your receivables workspace.",
  ],
  [
    "How does Chase work with Bolna?",
    "Bolna powers the voice conversation. Chase supplies account context, enforces contact rules, handles payment links and promises, and analyzes completed calls. Bolna makes the call. Chase gets you paid.",
  ],
  [
    "Is the demo making real calls or payments?",
    "No. The walkthrough on this page is a local, illustrative simulation. It never calls a phone, sends a WhatsApp message or moves money. Live workspace actions require authentication and the configured contact safeguards.",
  ],
  [
    "Can I use my existing receivables ledger?",
    "You can import a CSV ledger into the workspace. Chase stores invoice balances, due dates and contact history together so the calling queue can reflect the latest account information.",
  ],
  [
    "What stops an agent from calling at the wrong time?",
    "Collection calls pass through a contact gate with calling windows, attempt limits, opt-outs and other safeguards. Demo calls also require an allowlisted recipient. These are engineering controls, not a legal certification.",
  ],
  [
    "Who controls changes to the agent?",
    "You do. Prompt improvements include supporting evidence and simulator results. An owner must approve the proposed change before activation, and protected conduct sections cannot be changed by a proposal.",
  ],
];

function Waveform({ active = true }: { active?: boolean }) {
  return (
    <div
      className={`${styles.waveform} ${active ? styles.waveActive : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: 39 }, (_, i) => (
        <i
          key={i}
          style={{
            height: `${12 + ((i * 17 + 11) % 43)}px`,
            animationDelay: `${i * -0.087}s`,
          }}
        />
      ))}
    </div>
  );
}

function HeroScene() {
  const reduced = useReducedMotion();
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || reduced) return;
    const timer = window.setInterval(
      () => setScene((value) => (value + 1) % 3),
      5800,
    );
    return () => window.clearInterval(timer);
  }, [paused, reduced]);
  return (
    <div className={styles.heroVisual}>
      <div className={styles.orbit} aria-hidden="true" />
      <Image
        className={styles.heroMascot}
        src="/assets/chase-mascot.webp"
        alt="Chase’s friendly mouse mascot wearing a headset"
        width={800}
        height={731}
        priority
      />
      <div className={styles.visualLabel}>
        <span className={styles.statusDot} /> THE FOLLOW-UP, REIMAGINED
      </div>
      <div className={styles.sceneFrame}>
        <AnimatePresence mode="wait">
          <motion.div
            key={scene}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className={styles.floatingCard}
          >
            <div className={styles.cardTop}>
              <span>
                {["CONVERSATION", "PAYMENT LINK", "PROMISE TO PAY"][scene]}
              </span>
              <span className={styles.demoPill}>ILLUSTRATIVE DEMO</span>
            </div>
            <div className={styles.contactRow}>
              <span className={styles.avatar}>SG</span>
              <div>
                <strong>Sharma General Store</strong>
                <small>
                  {
                    [
                      "Hinglish · AI assistant",
                      "A next step, mid-conversation",
                      "A date you can follow up on",
                    ][scene]
                  }
                </small>
              </div>
              <span className={styles.smallIcon}>
                {scene === 0 ? (
                  <AudioLines size={19} />
                ) : scene === 1 ? (
                  <Wallet size={19} />
                ) : (
                  <Check size={19} />
                )}
              </span>
            </div>
            {scene === 0 ? (
              <>
                <Waveform />
                <p className={styles.cardQuote}>
                  “पिछली बार आपने 5 तारीख बोला था…”
                </p>
              </>
            ) : scene === 1 ? (
              <div className={styles.paymentPreview}>
                <span>Amount to pay</span>
                <strong>
                  ₹2,000<span>.00</span>
                </strong>
                <div>
                  <MessageCircle size={14} /> UPI link prepared{" "}
                  <Check size={14} />
                </div>
              </div>
            ) : (
              <div className={styles.promisePreview}>
                <div>
                  <Clock3 size={21} />
                  <span>
                    5 November<strong>₹2,000 promised</strong>
                  </span>
                </div>
                <p>Remembered. Recorded. Ready to follow up.</p>
              </div>
            )}
            <div className={styles.cardBottom}>
              <ShieldCheck size={13} /> Identity confirmed before invoice
              details
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={styles.ratingFloat}>
        <span className={styles.ratingIcon}>
          <TrendingUp size={18} />
        </span>
        <div>
          <small>CHASE RATING</small>
          <strong>
            77 <span>/ 100</span>
          </strong>
        </div>
        <span className={styles.ratingNote}>
          A reason behind
          <br />
          every next call.
        </span>
      </div>
      <div
        className={styles.sceneControls}
        aria-label="Product preview controls"
      >
        {["Conversation", "Payment link", "Promise to pay"].map((label, i) => (
          <button
            key={label}
            aria-label={`Show ${label.toLowerCase()} preview`}
            aria-pressed={scene === i}
            onClick={() => {
              setScene(i);
              setPaused(true);
            }}
          >
            <span />
            {label}
          </button>
        ))}
        <button
          aria-label={paused ? "Play product preview" : "Pause product preview"}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </div>
    </div>
  );
}

function Walkthrough() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!hasBolnaVoiceRecording) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => {
      setPlaying(false);
      setAudioError(true);
    });
  }, [playing, step]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function speakStep(index: number) {
    if (!("speechSynthesis" in window)) {
      setPlaying(false);
      setAudioError(true);
      return;
    }
    speechRef.current = null;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(walkthroughLines[index]);
    utterance.lang = "hi-IN";
    utterance.rate = 0.92;
    const localHindi = window.speechSynthesis
      .getVoices()
      .find(
        (voice) =>
          voice.localService && voice.lang.toLowerCase().startsWith("hi"),
      );
    if (localHindi) utterance.voice = localHindi;
    utterance.onend = () => {
      if (speechRef.current !== utterance) return;
      if (index === steps.length - 1) {
        speechRef.current = null;
        setPlaying(false);
      } else {
        setStep(index + 1);
        speakStep(index + 1);
      }
    };
    utterance.onerror = () => {
      if (speechRef.current !== utterance) return;
      speechRef.current = null;
      setPlaying(false);
      setAudioError(true);
    };
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  }

  function stopVoice() {
    setPlaying(false);
    if (!hasBolnaVoiceRecording && "speechSynthesis" in window) {
      speechRef.current = null;
      window.speechSynthesis.cancel();
    }
  }

  function playOrPause() {
    if (playing) {
      stopVoice();
      return;
    }
    setAudioError(false);
    const next = step === steps.length - 1 ? 0 : step;
    if (next !== step) setStep(next);
    if (hasBolnaVoiceRecording) setPlaying(true);
    else speakStep(next);
  }

  const current = steps[step];
  return (
    <section
      id="walkthrough"
      className={`${styles.section} ${styles.walkthrough}`}
    >
      <div className={styles.sectionIntro}>
        <span className={styles.eyebrow}>01 / FROM DUE TO DONE</span>
        <h2>
          A better follow-up.
          <br />
          <span>In every language of business.</span>
        </h2>
        <p>
          Explore one example conversation. See the context, the action, and
          what happens next.
        </p>
      </div>
      <div className={styles.demoConsole}>
        <div className={styles.consoleHeader}>
          <span>
            <span className={styles.statusDot} /> SHARMA GENERAL STORE
          </span>
          <span>SIMULATED WALKTHROUGH · NO REAL CALL</span>
        </div>
        <div className={styles.walkthroughGrid}>
          <div className={styles.stepList}>
            {steps.map((item, i) => (
              <button
                key={item.label}
                onClick={() => {
                  setStep(i);
                  stopVoice();
                  setAudioError(false);
                }}
                aria-pressed={step === i}
              >
                <span className={styles.stepNumber}>
                  {i < step ? <Check size={16} /> : `0${i + 1}`}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {
                      [
                        "A respectful introduction",
                        "The context that matters",
                        "Payment links & promises",
                        "A clear outcome",
                      ][i]
                    }
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
          <div className={styles.conversationDemo}>
            <div className={styles.conversationMeta}>
              <span>
                <AudioLines size={15} /> CHASE VOICE
              </span>
              <span>HI / EN</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h3>{current.title}</h3>
                <p className={styles.hindiQuote}>{current.quote}</p>
                <span className={styles.outcome}>
                  <current.icon size={15} />
                  {current.detail}
                </span>
              </motion.div>
            </AnimatePresence>
            <Waveform active={playing} />
            {hasBolnaVoiceRecording && (
              <audio
                ref={audioRef}
                src={walkthroughAudioPath(step)}
                preload="none"
                onEnded={() => {
                  if (step === steps.length - 1) setPlaying(false);
                  else setStep(step + 1);
                }}
                onError={() => {
                  setPlaying(false);
                  setAudioError(true);
                }}
              />
            )}
            <div className={styles.player}>
              <button
                className={styles.roundButton}
                aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
                onClick={playOrPause}
              >
                {playing ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <span>
                {playing ? "Playing voice preview" : "Hear the conversation"}
                <small role={audioError ? "alert" : undefined}>
                  {audioError
                    ? "Voice unavailable on this device. Read the transcript above."
                    : hasBolnaVoiceRecording
                      ? "Prerecorded Bolna voice · fictional example · no live call"
                      : "Device voice preview · Bolna recording pending · no live call"}
                </small>
              </span>
              <button
                className={styles.roundButton}
                aria-label="Restart walkthrough"
                onClick={() => {
                  stopVoice();
                  setAudioError(false);
                  setStep(0);
                  if (audioRef.current) audioRef.current.currentTime = 0;
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [feature, setFeature] = useState("prioritize");
  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProductOpen(false);
        setMobileOpen(false);
      }
    };
    const outside = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node))
        setProductOpen(false);
    };
    window.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.site}>
        <a href="#main" className={styles.skipLink}>
          Skip to content
        </a>
        <header className={styles.header}>
          <div className={styles.navbar}>
            <ChaseBrand />
            <nav aria-label="Main navigation" className={styles.desktopNav}>
              <div className={styles.productNav} ref={navRef}>
                <button
                  onClick={() => setProductOpen(!productOpen)}
                  aria-expanded={productOpen}
                  aria-controls="product-menu"
                >
                  Product <ChevronDown size={13} />
                </button>
                {productOpen && (
                  <div id="product-menu" className={styles.productMenu}>
                    {features.map((feature) => (
                      <a
                        key={feature.id}
                        href={`#features`}
                        onClick={() => {
                          setFeature(feature.id);
                          setProductOpen(false);
                        }}
                      >
                        <feature.icon size={18} />
                        <span>
                          {feature.label}
                          <small>{feature.note}</small>
                        </span>
                        <ArrowUpRight size={14} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <a href="#walkthrough">How it works</a>
              <a href="#businesses">For your business</a>
              <a href="#questions">FAQs</a>
            </nav>
            <div className={styles.navActions}>
              <Link href="/login" className={styles.loginLink}>
                Log in <ArrowUpRight size={13} />
              </Link>
              <a className={styles.navCta} href="#walkthrough">
                Explore Chase <ArrowRight size={14} />
              </a>
              <button
                className={styles.mobileToggle}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
                aria-controls="mobile-menu"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X /> : <Menu />}
              </button>
            </div>
          </div>
          {mobileOpen && (
            <nav
              id="mobile-menu"
              aria-label="Mobile navigation"
              className={styles.mobileNav}
            >
              {[
                ["#features", "Product"],
                ["#walkthrough", "How it works"],
                ["#businesses", "For your business"],
                ["#questions", "FAQs"],
                ["/login", "Open workspace"],
              ].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMobileOpen(false)}>
                  {label}
                  <ArrowUpRight size={16} />
                </a>
              ))}
            </nav>
          )}
        </header>
        <main id="main">
          <div className={styles.heroWrap}>
            <a
              href="https://sagarmathalabs.com"
              target="_blank"
              rel="noreferrer"
              className={styles.announcement}
            >
              <span className={styles.announcementDot} /> Backed by Sagarmatha
              Labs <ArrowUpRight size={14} />
            </a>
            <section className={styles.hero}>
              <div className={styles.heroCopy}>
                <span className={styles.eyebrow}>
                  <span className={styles.statusDot} /> VOICE-POWERED
                  RECEIVABLES
                </span>
                <h1>
                  Less chasing.
                  <br />
                  <span>More business.</span>
                </h1>
                <p>
                  Your invoices deserve a follow-up.
                  <br />
                  Your customers deserve a conversation.
                  <br />
                  <strong>Chase takes care of both.</strong>
                </p>
                <div className={styles.heroActions}>
                  <a href="#walkthrough" className={styles.primaryButton}>
                    See Chase in action <ArrowRight size={17} />
                  </a>
                  <Link href="/signup" className={styles.secondaryButton}>
                    Get started free <ArrowUpRight size={17} />
                  </Link>
                </div>
                <div className={styles.heroFootnote}>
                  <AudioLines size={15} /> Bolna makes the call. Chase gets you
                  paid.
                </div>
              </div>
              <HeroScene />
            </section>
          </div>
          <div className={styles.businessStrip}>
            <span>
              BUILT FOR THE BUSINESSES
              <br />
              THAT KEEP INDIA MOVING.
            </span>
            <div>Distributors</div>
            <div>Wholesalers</div>
            <div>Schools</div>
            <div>Clinics</div>
            <a href="#businesses" aria-label="Explore businesses">
              <ArrowDown size={20} />
            </a>
          </div>
          <section id="features" className={styles.section}>
            <div className={styles.centerIntro}>
              <span className={styles.eyebrow}>THE BRAIN AROUND THE CALL</span>
              <h2>
                Context. Conversation. Collection.
                <br />
                <span>Everything follows through.</span>
              </h2>
              <p>
                One connected system, from your first unpaid invoice to your
                last follow-up of the day.
              </p>
            </div>
            <Tabs
              value={feature}
              onValueChange={setFeature}
              className={styles.featureTabs}
            >
              <TabsList
                className={styles.tabList}
                aria-label="Chase capabilities"
              >
                {features.map((feature) => (
                  <TabsTrigger
                    className={styles.tabTrigger}
                    value={feature.id}
                    key={feature.id}
                  >
                    <feature.icon size={17} />
                    {feature.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {features.map((feature, i) => (
                <TabsContent
                  className={styles.featurePanel}
                  value={feature.id}
                  key={feature.id}
                >
                  <div className={styles.featureCopy}>
                    <span className={styles.featureIndex}>
                      0{i + 1} / {feature.label.toUpperCase()}
                    </span>
                    <h3>{feature.title}</h3>
                    <p>{feature.text}</p>
                    <span className={styles.featureNote}>
                      <Check size={15} />
                      {feature.note}
                    </span>
                    <Link href="/login">
                      Explore the workspace <ArrowUpRight size={15} />
                    </Link>
                  </div>
                  <div className={styles.featureVisual}>
                    <div className={styles.miniToolbar}>
                      <span>
                        <feature.icon size={15} />{" "}
                        {feature.label === "Prioritize"
                          ? "Priority queue"
                          : feature.label}
                      </span>
                      <span>EXAMPLE DATA</span>
                    </div>
                    {feature.rows.map(([title, value, note], index) => (
                      <div key={title} className={styles.featureRow}>
                        <span className={styles.rowIndex}>0{index + 1}</span>
                        <div>
                          <strong>{title}</strong>
                          <small>{note}</small>
                        </div>
                        <span className={styles.rowValue}>{value}</span>
                      </div>
                    ))}
                    <div className={styles.visualFootnote}>
                      <ShieldCheck size={14} /> Every action leaves a trace.
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </section>
          <Walkthrough />
          <section
            id="businesses"
            className={`${styles.section} ${styles.businessSection}`}
          >
            <div className={styles.sectionIntro}>
              <span className={styles.eyebrow}>
                02 / BUILT FOR YOUR EVERYDAY
              </span>
              <h2>
                Big on relationships.
                <br />
                <span>Done with chasing dues.</span>
              </h2>
              <p>
                For the businesses where knowing your customer matters as much
                as getting paid.
              </p>
            </div>
            <div className={styles.useCases}>
              {[
                {
                  icon: Wallet,
                  name: "Distributors & wholesalers",
                  text: "Keep udhaar moving. Follow up across accounts, remember commitments and put your biggest opportunities first.",
                  tag: "INVOICE DUES",
                },
                {
                  icon: Users,
                  name: "Schools & education",
                  text: "Give fee reminders a human touch. Keep dates, preferences and follow-ups in one place.",
                  tag: "FEE FOLLOW-UPS",
                },
                {
                  icon: HeartHandshake,
                  name: "Clinics & practices",
                  text: "Respectful billing conversations, with identity checks before details and a clear route back to your team.",
                  tag: "BILLING FOLLOW-UPS",
                },
              ].map((item) => (
                <article key={item.name}>
                  <item.icon size={25} />
                  <span>{item.tag}</span>
                  <h3>{item.name}</h3>
                  <p>{item.text}</p>
                  <Link href="/login">
                    Explore workspace <ArrowUpRight size={16} />
                  </Link>
                </article>
              ))}
            </div>
          </section>
          <section className={styles.conductSection}>
            <div>
              <ShieldCheck size={28} />
              <span className={styles.eyebrow}>RESPECT IS A REQUIREMENT</span>
              <h2>
                Persistent about payments.
                <br />
                <span>Thoughtful about people.</span>
              </h2>
              <p>
                Clear AI disclosure. Identity before invoice details. Calling
                windows, opt-outs and decisions you can inspect. Built into the
                workflow.
              </p>
              <a href="#questions">
                How the safeguards work <ArrowUpRight size={16} />
              </a>
            </div>
            <div className={styles.conductCard}>
              <div>
                <span className={styles.statusDot} /> CONTACT GATE
              </div>
              {[
                "Allowed calling hours",
                "Attempt limits checked",
                "Opt-outs respected",
                "Identity before disclosure",
              ].map((item) => (
                <p key={item}>
                  <ShieldCheck size={16} />
                  {item}
                  <Check size={16} />
                </p>
              ))}
              <small>Engineering safeguards · not a legal certification</small>
            </div>
          </section>
          <section
            id="questions"
            className={`${styles.section} ${styles.faqSection}`}
          >
            <div>
              <span className={styles.eyebrow}>A FEW GOOD QUESTIONS</span>
              <h2>Glad you asked.</h2>
              <p>
                Meet the system behind
                <br />
                the conversation.
              </p>
            </div>
            <div className={styles.faqList}>
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span>
                      <span>+</span>
                      <span>−</span>
                    </span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
          <section className={styles.finalCta}>
            <Image
              src="/assets/chase-mascot.webp"
              width={180}
              height={165}
              alt="Chase mascot"
            />
            <span className={styles.eyebrow}>
              YOUR NEXT FOLLOW-UP STARTS HERE
            </span>
            <h2>
              Get back to business.
              <br />
              <span>Leave the chase to us.</span>
            </h2>
            <div className={styles.heroActions}>
              <Link href="/signup" className={styles.primaryButton}>
                Start collecting free <ArrowRight size={17} />
              </Link>
              <a href="#walkthrough" className={styles.secondaryButton}>
                Explore the demo <Play size={15} />
              </a>
            </div>
          </section>
        </main>
        <footer className={styles.footer}>
          <div className={styles.footerTop}>
            <div>
              <ChaseBrand />
              <p>
                Bolna makes the call.
                <br />
                Chase gets you paid.
              </p>
            </div>
            <div>
              <span>PRODUCT</span>
              <a href="#features">Capabilities</a>
              <a href="#walkthrough">How it works</a>
              <Link href="/login">Workspace</Link>
            </div>
            <div>
              <span>EXPLORE</span>
              <a href="#businesses">For your business</a>
              <a href="#questions">Questions & answers</a>
              <Link href="/stage">
                Stage view <ArrowUpRight size={12} />
              </Link>
            </div>
            <div>
              <span>BUILT WITH CARE</span>
              <a
                href="https://sagarmathalabs.com"
                target="_blank"
                rel="noreferrer"
              >
                Sagarmatha Labs <ArrowUpRight size={12} />
              </a>
              <a href="https://www.bolna.ai" target="_blank" rel="noreferrer">
                Voice powered by Bolna <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <span>© {new Date().getFullYear()} Chase</span>
            <span>Made for the way India does business.</span>
            <span className={styles.peach}>चलिए, बात करते हैं।</span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
