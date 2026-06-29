import { Boxes } from "lucide-react";
import { WorkspaceGrid } from "@/components/workspace-grid";
import { AddWorkspace } from "@/components/add-workspace";

export const metadata = {
  title: "Workspaces - AI Tax Assistant Platform",
};

export default function WorkspacesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <Boxes className="h-5 w-5" /> Workspaces
        </h2>
        <p className="text-sm text-muted-foreground">
          One workspace per department. Each has its own documents (RAG) and runs
          under platform-wide governance. Open one to use its assistant, or create
          a new one.
        </p>
      </div>

      <main id="main" className="flex flex-col gap-4">
        <WorkspaceGrid />
        <AddWorkspace />
      </main>
    </div>
  );
}
