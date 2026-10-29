const command = process.argv[2];
if (command === "seed")
  console.log(
    "seed is reserved for Part 2: ledger schema and demo data. No data changed.",
  );
else if (command === "bolna:sync")
  console.log(
    "bolna:sync is reserved for Part 4: agents, tools and provider validation. No API calls made.",
  );
else {
  console.error("Unknown placeholder command");
  process.exitCode = 1;
}
