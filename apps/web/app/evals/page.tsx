import { BarChart3 } from "lucide-react";
import { EvalsWorkbench } from "@/components/evals-workbench";
import { PageGuide } from "@/components/page-guide";

export const metadata = {
  title: "Evals - IRAS Tax Assistant",
};

export default function EvalsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 pb-16">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
        <BarChart3 className="h-5 w-5" /> Evals
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Configure the model routing rules and the test cases, then run them with
        the keyword grader or an LLM judge. The router is deterministic and free;
        running a case calls the routed model and grades the answer. Rules and
        cases stay in your browser; completed runs persist to the run history.
      </p>
      <PageGuide page="evals" className="mt-4" />

      <div className="mt-6">
        <EvalsWorkbench />
      </div>
    </main>
  );
}
