"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clipboard,
  Command,
  CreditCard,
  FileSpreadsheet,
  Headphones,
  LayoutDashboard,
  ListFilter,
  Menu,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  productDocs,
  type DocBlock,
  type ProductDoc,
} from "@/lib/product-docs";
import styles from "./docs-site.module.css";

const iconBySlug = {
  overview: BookOpen,
  quickstart: LayoutDashboard,
  "importing-invoices": FileSpreadsheet,
  "chase-rating": ListFilter,
  "calls-and-conduct": Headphones,
  "payments-and-promises": CreditCard,
  "brief-and-ai": Sparkles,
  "plans-and-team": Users,
  "integrations-and-help": MessageSquareText,
};

function Flow({ variant }: { variant: "overview" | "rating" | "call" }) {
  if (variant === "rating")
    return (
      <div
        className={styles.ratingDiagram}
        aria-label="Rating inputs lead to a priority score; the contact gate is evaluated separately"
      >
        <div className={styles.diagramHeading}>
          <span>HOW PRIORITY IS BUILT</span>
          <span>ILLUSTRATIVE INPUTS</span>
        </div>
        {[
          ["Likelihood to pay", 78],
          ["Invoice weight", 66],
          ["Due date urgency", 84],
          ["Contact effort", 42],
        ].map(([label, value]) => (
          <div className={styles.ratingRow} key={label}>
            <span>{label}</span>
            <div className={styles.ratingTrack}>
              <i style={{ width: `${value}%` }} />
            </div>
            <b>{value}</b>
          </div>
        ))}
        <div className={styles.ratingResult}>
          <span>
            Deterministic score <strong>77 / 100</strong>
          </span>
          <span>→</span>
          <span>
            Contact gate <strong>Check separately</strong>
          </span>
        </div>
        <small>
          Example values illustrate the interface; they are not a live account
          or the scoring formula.
        </small>
      </div>
    );
  const nodes =
    variant === "overview"
      ? [
          "Invoice ledger",
          "Chase queue",
          "Bolna voice",
          "Outcome & actions",
          "Owner brief",
        ]
      : [
          "Contact gate",
          "AI disclosure",
          "Confirm identity",
          "Take action",
          "Completed analysis",
        ];
  return (
    <div className={styles.flowDiagram} aria-label={nodes.join(" then ")}>
      <div className={styles.diagramHeading}>
        <span>
          {variant === "overview" ? "THE CHASE LOOP" : "A RESPECTFUL CALL"}
        </span>
        <span>01 — 05</span>
      </div>
      <div className={styles.flowNodes}>
        {nodes.map((node, index) => (
          <div className={styles.flowItem} key={node}>
            <div className={styles.flowNode}>
              <small>0{index + 1}</small>
              <strong>{node}</strong>
            </div>
            {index < nodes.length - 1 && (
              <ArrowRight
                className={styles.flowArrow}
                size={18}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeTop}>
        <span>{label}</span>
        <button type="button" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "text":
      return <p className={styles.prose}>{block.text}</p>;
    case "list":
      return (
        <ul className={styles.bulletList}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className={styles.steps}>
          {block.items.map((item, index) => (
            <li key={item.title}>
              <span>0{index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      );
    case "code":
      return <CodeBlock label={block.label} code={block.code} />;
    case "note":
      return (
        <aside className={styles.note}>
          <ShieldCheck size={18} />
          <div>
            <strong>{block.title}</strong>
            <p>{block.text}</p>
          </div>
        </aside>
      );
    case "flow":
      return <Flow variant={block.variant} />;
  }
}

export function DocsSite({ doc }: { doc: ProductDoc }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const currentIndex = productDocs.findIndex((item) => item.slug === doc.slug);
  const previous = productDocs[currentIndex - 1];
  const next = productDocs[currentIndex + 1];
  const groups = [...new Set(productDocs.map((item) => item.group))];
  const needle = query.toLowerCase().trim();
  /** Every word a page contains, so a half-remembered phrase still finds it. */
  const haystack = (item: ProductDoc) =>
    [
      item.title,
      item.description,
      item.group,
      ...item.sections.flatMap((section) => [
        section.title,
        ...section.blocks.flatMap((block) => {
          if (block.kind === "text") return [block.text];
          if (block.kind === "list") return block.items;
          if (block.kind === "steps")
            return block.items.flatMap((step) => [step.title, step.text]);
          if (block.kind === "note") return [block.title, block.text];
          if (block.kind === "code") return [block.label, block.code];
          return [];
        }),
      ]),
    ]
      .join(" ")
      .toLowerCase();
  const matches = (item: ProductDoc) =>
    !needle || haystack(item).includes(needle);
  const resultCount = productDocs.filter(matches).length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSidebarOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.site}>
      <a className={styles.skipLink} href="#doc-content">
        Skip to documentation
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Chase home">
            <Image
              src="/assets/chase-mascot.webp"
              alt=""
              width={36}
              height={34}
            />
            <strong>
              chase<span>.</span>
            </strong>
          </Link>
          <span className={styles.headerDivider} />
          <Link href="/docs" className={styles.docsWordmark}>
            Documentation
          </Link>
          <nav
            className={styles.headerLinks}
            aria-label="Documentation navigation"
          >
            <Link href="/">Product</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/login" className={styles.openApp}>
              Open workspace <ArrowUpRight size={14} />
            </Link>
          </nav>
          <button
            className={styles.mobileMenu}
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={
              sidebarOpen
                ? "Close documentation menu"
                : "Open documentation menu"
            }
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>
      {sidebarOpen && (
        <button
          className={styles.mobileScrim}
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={styles.shell}>
        <aside
          className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
          aria-label="Documentation sidebar"
        >
          <label className={styles.searchBox}>
            <Search size={17} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the guide"
              aria-label="Search documentation"
            />
            <kbd>
              <Command size={12} /> K
            </kbd>
          </label>
          <nav aria-label="Documentation pages">
            {groups.map((group) => {
              const items = productDocs.filter(
                (item) => item.group === group && matches(item),
              );
              if (!items.length) return null;
              return (
                <div className={styles.navGroup} key={group}>
                  <p>{group}</p>
                  {items.map((item) => {
                    const Icon =
                      iconBySlug[item.slug as keyof typeof iconBySlug];
                    return (
                      <Link
                        key={item.slug}
                        href={
                          item.slug === "overview"
                            ? "/docs"
                            : `/docs/${item.slug}`
                        }
                        className={
                          item.slug === doc.slug ? styles.activeLink : ""
                        }
                        aria-current={
                          item.slug === doc.slug ? "page" : undefined
                        }
                        onClick={() => setSidebarOpen(false)}
                      >
                        <Icon size={17} />
                        <span>{item.title}</span>
                        {item.slug === doc.slug && (
                          <span className={styles.activeDot} />
                        )}
                      </Link>
                    );
                  })}
                  {items.some((item) => item.slug === doc.slug) && (
                    <div className={styles.navSections}>
                      {doc.sections.map((section) => (
                        <a
                          key={section.id}
                          href={`#${section.id}`}
                          onClick={() => setSidebarOpen(false)}
                        >
                          {section.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {needle &&
              (resultCount === 0 ? (
                <p className={styles.noResults}>
                  No guide pages match “{query}”.
                </p>
              ) : (
                <p className={styles.resultCount}>
                  {resultCount} of {productDocs.length} pages match
                </p>
              ))}
          </nav>
          <div className={styles.sidebarBottom}>
            <span>NEED A HAND?</span>
            <p>Explore the product or talk to the Chase team.</p>
            <Link href="/contact-sales">
              Contact us <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>
        <main id="doc-content" className={styles.main}>
          <div className={styles.breadcrumb}>
            <Link href="/docs">Guides</Link>
            <ChevronRight size={14} />
            <span>{doc.group}</span>
            <ChevronRight size={14} />
            <strong>{doc.title}</strong>
          </div>
          <div className={styles.articleGrid}>
            <article className={styles.article}>
              <div className={styles.articleIntro}>
                <span className={styles.eyebrow}>{doc.eyebrow}</span>
                <h1>
                  {doc.title}
                  <span>.</span>
                </h1>
                <p>{doc.description}</p>
              </div>
              {doc.sections.map((section) => (
                <section
                  id={section.id}
                  key={section.id}
                  className={styles.section}
                >
                  <h2>{section.title}</h2>
                  {section.blocks.map((block, index) => (
                    <Block key={`${section.id}-${index}`} block={block} />
                  ))}
                </section>
              ))}
              <div className={styles.pageNav}>
                {previous ? (
                  <Link
                    href={
                      previous.slug === "overview"
                        ? "/docs"
                        : `/docs/${previous.slug}`
                    }
                  >
                    <ArrowLeft size={18} />
                    <span>
                      <small>PREVIOUS</small>
                      <strong>{previous.title}</strong>
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link href={`/docs/${next.slug}`}>
                    <span>
                      <small>UP NEXT</small>
                      <strong>{next.title}</strong>
                    </span>
                    <ArrowRight size={18} />
                  </Link>
                )}
              </div>
              <footer className={styles.footer}>
                <span>Bolna makes the call. Chase gets you paid.</span>
                <Link href="/">
                  Back to Chase <ArrowUpRight size={14} />
                </Link>
              </footer>
            </article>
            <aside className={styles.toc} aria-label="On this page">
              <p>ON THIS PAGE</p>
              {doc.sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
              <Link href="/signup" className={styles.tocCta}>
                Start with Chase <ArrowRight size={15} />
              </Link>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
