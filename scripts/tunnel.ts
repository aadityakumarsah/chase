import { platform } from "node:os";
console.log(`Public HTTPS tunnel instructions (${platform()}):`);
if (platform() === "darwin")
  console.log(
    "Install: brew install cloudflared  OR  brew install ngrok/ngrok/ngrok",
  );
console.log("1. Start Chase: pnpm dev");
console.log("2. Cloudflare: cloudflared tunnel --url http://localhost:3000");
console.log(
  "   OR ngrok: ngrok http 3000 (configure your account locally first)",
);
console.log(
  "3. Set APP_BASE_URL locally to the HTTPS URL and restart pnpm dev.",
);
console.log(
  "4. In later parts, configure Bolna webhook and tool URLs against that origin.",
);
console.log(
  "The dashboard passcode and route-specific tool/webhook credentials remain required.",
);
