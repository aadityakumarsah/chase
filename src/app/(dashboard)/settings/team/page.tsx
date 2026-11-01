import { PageHeading } from "@/components/page-heading";
import { SettingsNav } from "@/components/dashboard/settings-nav";
import { TeamSettings } from "@/components/dashboard/team-settings";

export default function Team() {
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Workspace"
        title="Team"
        description="Who can see and act in this workspace, and what each role is allowed to do."
      />
      <SettingsNav />
      <TeamSettings />
    </main>
  );
}
