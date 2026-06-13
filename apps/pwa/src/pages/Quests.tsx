import QuestsPanel from "@/components/QuestsPanel";

// Dedicated quest-management tab — the full board: every section (Active / Blocked /
// Snoozed / Suggested / Converted / Completed / Archived), no caps. Same deterministic
// backend as the Home panel.
export default function Quests() {
  return (
    <div className="px-5 pt-6 pb-6">
      <QuestsPanel variant="full" />
      <p className="cap-data mt-6" style={{ color: "var(--text-dim)" }}>
        Quests are deterministic — generated from your live vault (briefs, inbox, nodes, projects, Time Machine). Node-anchored quests link to the Atlas.
      </p>
    </div>
  );
}
