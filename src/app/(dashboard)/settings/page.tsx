import { PageHeading } from "@/components/page-heading";
import { SettingsNav } from "@/components/dashboard/settings-nav";
import { SettingsPage } from "@/components/dashboard/settings-page";
import { WorkspaceSettings } from "@/components/dashboard/workspace-settings";

export default function Settings() {
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="Workspace"
        title="Settings"
        description="Your business, how you get paid, and how Chase is allowed to contact your customers."
      />
      <SettingsNav />
      <WorkspaceSettings />
      <SettingsPage />
    </main>
  );
}
