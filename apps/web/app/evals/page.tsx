import { BarChart3 } from "lucide-react";
import { EvalsWorkbench } from "@/components/evals-workbench";

export const metadata = {
  title: "Evaluation - AI Tax Assistant Platform",
};

export default function EvalsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
        <BarChart3 className="h-5 w-5" /> AI Evaluation
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Define test cases and run them against the keyword grader or an LLM
        judge. Cases stay in your browser; completed runs are saved to the run
        history below.
      </p>

      <div className="mt-6">
        <EvalsWorkbench />
      </div>
    </main>
  );
}
