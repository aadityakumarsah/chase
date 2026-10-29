import { type Env } from "@/lib/env";
import { type Task } from "./types";
export const TASK_TIERS: Record<Task, "FAST" | "SMART" | "DEEP"> = {
  dossier: "FAST",
  supervisor: "FAST",
  rating_rationale: "FAST",
  ping: "FAST",
  call_analysis: "SMART",
  persona_sim: "SMART",
  sim_judge: "SMART",
  chat_proxy: "SMART",
  brief: "DEEP",
  prompt_pr: "DEEP",
};
export const TASK_TIMEOUTS: Record<Task, number> = {
  dossier: 8000,
  supervisor: 1500,
  call_analysis: 25000,
  brief: 90000,
  prompt_pr: 90000,
  rating_rationale: 8000,
  persona_sim: 25000,
  sim_judge: 25000,
  chat_proxy: 25000,
  ping: 25000,
};
export function modelFor(task: Task, env: Env): string {
  const key = `LLM_MODEL_FOR_${task.toUpperCase()}` as keyof Env;
  return (
    (env[key] as string | undefined) ?? env[`LLM_MODEL_${TASK_TIERS[task]}`]
  );
}
