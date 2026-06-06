import { BarChart3 } from "lucide-react";
import { EvalsWorkbench } from "@/components/evals-workbench";

export const metadata = {
  title: "Evaluations - IRAS Tax Assistant",
};

export default function EvalsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 pb-16">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
        <BarChart3 className="h-4 w-4" /> llm-eval-iras
      </div>
      <h2 className="text-xl font-semibold text-navy">Evaluations</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Configure the model routing rules and the test cases, then run them. The
        router is deterministic and free; running a case calls the routed model and
        grades the answer against your keywords. Edits stay in your browser.
      </p>
      <div className="mt-6">
        <EvalsWorkbench />
      </div>
    </main>
  );
}
