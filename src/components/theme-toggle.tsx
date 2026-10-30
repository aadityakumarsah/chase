"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Use ${dark ? "light" : "dark"} theme`}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </Button>
  );
}
