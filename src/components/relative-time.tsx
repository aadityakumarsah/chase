"use client";
import { formatDistanceToNow } from "date-fns";
import { formatIST } from "@/lib/time";
export function RelativeTime({
  value,
  className,
}: {
  value: string | Date;
  className?: string;
}) {
  const date = value instanceof Date ? value : new Date(value);
  return (
    <time
      className={className}
      dateTime={date.toISOString()}
      title={`${formatIST(date)} IST`}
    >
      {formatDistanceToNow(date, { addSuffix: true })}
    </time>
  );
}
