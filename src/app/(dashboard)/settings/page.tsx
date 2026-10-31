import { PageHeading } from "@/components/page-heading";
import { SettingsPage } from "@/components/dashboard/settings-page";
import { WorkspaceSettings } from "@/components/dashboard/workspace-settings";

export default function Settings() {
  return (
    <div className="space-y-8">
      <div className="space-y-6 p-6 pb-0">
        <PageHeading
          title="Workspace settings"
          description="Your business, how you get paid, and how Chase is allowed to contact your customers."
        />
        <WorkspaceSettings />
      </div>
      <SettingsPage />
    </div>
  );
}
