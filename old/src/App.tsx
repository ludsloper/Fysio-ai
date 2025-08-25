
import { useState } from "react";
import QuestionsView from "./views/QuestionsView";
import EvaluationView from "./views/EvaluationView";
import { Button } from "@/components/ui/button";
import type { Answers } from "@/types/answers";

export default function App() {
  const [view, setView] = useState<'vragen' | 'evaluatie'>("vragen");
  const [answers, setAnswers] = useState<Answers | null>(null); // Will be initialized in QuestionsView
  const [loading, setLoading] = useState(false);
  const [split, setSplit] = useState<boolean>(true);

  // For test/dev: load prefilled answers
  const handleLoadTestData = () => {
    setLoading(true);
    import("./data/testAnswers").then(mod => {
      setAnswers(mod.testAnswers);
      setView("vragen");
      setLoading(false);
    });
  };

  return (
    <div className="mx-auto p-4 max-w-[1400px]">
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Button variant={view === "vragen" ? "default" : "outline"} onClick={() => setView("vragen")} disabled={split}>Vragenlijst</Button>
        <Button variant={view === "evaluatie" ? "default" : "outline"} onClick={() => setView("evaluatie")} disabled={split}>Evaluatie</Button>
        <Button variant={split ? "default" : "outline"} onClick={() => setSplit(s => !s)}>{split ? 'Split-view aan' : 'Split-view uit'}</Button>
        <Button variant="secondary" onClick={handleLoadTestData}>Testdata laden</Button>
      </div>
      {loading && <div className="flex items-center gap-2"><span className="animate-pulse">Laden...</span></div>}
      {!loading && (
        split ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="max-w-3xl">
              <QuestionsView answers={answers} setAnswers={setAnswers} />
            </div>
            <div className="min-w-0 lg:sticky lg:top-4 h-fit">
              <EvaluationView answers={answers} showBack={false} />
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {view === "vragen" && <QuestionsView answers={answers} setAnswers={setAnswers} />}
            {view === "evaluatie" && <EvaluationView answers={answers} setView={setView} />}
          </div>
        )
      )}
    </div>
  );
}
