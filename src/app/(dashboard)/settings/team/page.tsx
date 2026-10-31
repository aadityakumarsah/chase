import { PageHeading } from "@/components/page-heading";
import { TeamSettings } from "@/components/dashboard/team-settings";

export default function Team() {
  return (
    <div className="space-y-6 p-6">
      <PageHeading
        title="Teammates"
        description="Who can see and act in this workspace."
      />
      <TeamSettings />
    </div>
  );
}
