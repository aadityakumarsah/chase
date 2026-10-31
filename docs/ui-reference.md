# Chase public experience — reference and implementation

Reference inspected: https://mastra.ai on 31 October 2026.
REA: https://github.com/morluto/rea, npm `rea-agents@6.8.0`.
Workflow: https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md.

## Observations

- The reference uses a near-black background, a sticky navigation bar, a compact announcement tab, an asymmetric hero, floating product examples, rounded actions and large sections separated by restrained borders.
- Browser inspection measured a 54px hero heading and 40px feature headings at 1440px. Feature selectors, dropdown navigation and expandable FAQs are interactive. Product illustrations animate with staggered short transitions.
- REA statically analyzed two captured homepage scripts (`asset-19.js` and `asset-30.js`), 85,546 bytes with 15,446 visited AST nodes and no parse failures. Parent evidence: `ev_904aa281f433984073b9f0071ff6819d38c7fd58fd837a33402f94c8c9fd4258`.
- The selected bundle contains a three-frame hero interval at 4,500ms, a reduced-motion check, effect cleanup, tab click/keyboard handlers, ARIA selection/control relationships, and FAQ summary listeners with transition completion handling.
- Scope is deliberately partial: REA did not analyze 31 inventoried files, and static relationships do not prove execution. Local browser inspection supplied the visual/runtime evidence. REA emitted a Node patch-version engine warning on the available Node 22.23.1 runtime, but the bounded static analysis completed successfully.
- The shared browser snapshot tool timed out twice. Reference inspection continued through local headless Chrome. Raw captures and the complete REA evidence bundle stay in ignored `.artifacts/`; third-party scripts are not part of Chase's shipped assets.

## Chase adaptation

- `/` is a public product homepage; `/login` is a dedicated sign-in; `/dashboard` is the protected operational overview. Other dashboard routes, API authentication and role guards retain their existing boundaries.
- The hero uses the supplied Chase mascot, warm peach accents, three manually selectable product previews, a pause control, and a reduced-motion preference. The reference's green accent, customer logos, claims and source code are not used.
- Product navigation selects one of six accessible feature tabs. A four-step, locally simulated Hinglish walkthrough supports play, pause, restart and manual selection. It makes no call, message or payment request; its illustrative data is labelled.
- Business-use-case sections, conduct explanation, native FAQ disclosures, footer links and workspace calls to action complete the public page. No fabricated customer logos or testimonials.
- Stage uses the same brand with real SWR data. Its conversation and messages are separate views; terminal calls say “latest conversation” instead of appearing live. Money, promises, call counts and conduct outcomes remain visible on presentation-sized screens. Long histories scroll within their own panels. Mobile uses natural page scrolling.
- Stage controls preserve the guarded call, simulated payment, owner-brief and confirmed reset actions. No such action is invoked by browser verification. Read-only views do not offer mutation controls. Keyboard handlers ignore modifiers, repeats and interactive fields; network failures are caught and duplicate actions are suppressed while pending.

## Assets

Original user files remain unchanged in `docs/assets/logo.png` and `docs/assets/background.png`.
The public mascot is a cropped, compressed WebP derived from the supplied logo, served from `public/assets/chase-mascot.webp`. The wordmark WebP is also derived from the supplied asset for reuse.
