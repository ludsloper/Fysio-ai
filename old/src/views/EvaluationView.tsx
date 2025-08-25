import { useMemo } from "react";
import { Card } from "../components/ui/card";
import type { Answers, Alcohol } from "@/types/answers";

interface EvaluationViewProps {
  answers: Answers | null;
  setView?: (v: 'vragen') => void;
  showBack?: boolean;
}

function getLevelColor(level: number) {
  if (level >= 80) return "bg-red-900 text-white";
  if (level >= 60) return "bg-red-600 text-white";
  if (level >= 30) return "bg-yellow-400 text-black";
  return "bg-green-500 text-white";
}

function clamp01(x: number) {
  return Math.max(0, Math.min(100, x));
}

function toDailyAlcohol(alcohol: Alcohol | undefined): number {
  if (!alcohol?.uses) return 0;
  const amt = Number(alcohol.amount || 0);
  if (!amt) return 0;
  if (alcohol.freq === 'week') return amt / 7;
  return amt; // per day
}

function bmiKgM2(heightCm?: number, weightKg?: number): number | null {
  const h = Number(heightCm || 0) / 100;
  const w = Number(weightKg || 0);
  if (!h || !w) return null;
  return w / (h * h);
}

export default function EvaluationView({ answers, setView, showBack = true }: EvaluationViewProps) {
  const evaluation = useMemo(() => {
    if (!answers) return null;
    const tri = answers.triage || {};
    const conds: string[] = answers.conditions || [];
    const meds: string[] = answers.medication || [];
    const age = Number(answers.age || 0);
    const gender = answers.gender;
    const dailyAlcohol = toDailyAlcohol(answers.alcohol);
    const cObesitas = conds.includes('obesitas');
    const cOsteoporose = conds.includes('osteoporose');
    const cDiabetes = conds.includes('diabetes');
    const cReuma = conds.includes('reuma');
    const cKanker = conds.includes('kanker');
    const recentSurgery = !!answers.recentSurgery;
    const bmi = bmiKgM2(typeof answers.height === 'number' ? answers.height : undefined,
      typeof answers.weight === 'number' ? answers.weight : undefined);
    const obese = cObesitas || (!!bmi && bmi >= 30);

    // LRS Probability (0-100)
    let lrs = 0;
    if (tri.radiatingPastKnee) lrs += 40; // 7
    if (tri.burning) lrs += 10; // 7.1
    if (tri.shooting) lrs += 10; // 7.2
    if (tri.numbness) lrs += 10; // 7.3
    if (tri.touchPain) lrs += 10; // 7.4
    if (tri.coughWorse) lrs += 10; // 7.5
    lrs = clamp01(lrs);

    // Wervelfractuur risk
    let fx = 0;
    if (tri.afterFall && (tri.fallType === 'a' || tri.fallType === 'b')) fx += 60; // donker rood
    else if (tri.afterFall && tri.fallType === 'c') fx += 30; // oranje
    if (age > 80) fx += 40; // rood
    else if (age > 65) fx += 30; // oranje
    if (gender === 'vrouw' && age > 65) fx += 20; // geel
    if (cOsteoporose) fx += 40; // rood
    if (meds.includes('corticosteroiden')) fx += 30; // oranje (proxy for long-term)
    if (cKanker) fx += 30; // oranje (history)
    if (dailyAlcohol >= 3) fx += 20; // geel
    if (answers.smoking?.uses && Number(answers.smoking?.amount || 0) >= 20) fx += 20; // geel
    if (tri.firstTime && age > 50) fx += 20; // geel
    if (cReuma || cDiabetes) fx += 20; // geel
    fx = clamp01(fx);

    // Tumor (spinale maligniteit)
    let tumor = 0;
    if (cKanker) tumor += 60; // hoogste risicofactor
    if (tri.firstTime && (age < 20 || age > 50)) tumor += 30; // oranje
    if (tri.notFit) tumor += 10; // geel
    if (tri.fever) tumor += 30; // oranje
    if (tri.weightLoss) tumor += 30; // oranje
    if (tri.nightPain && tri.nightPainChange === false) tumor += 30; // niet-mechanisch
    if (tri.radiatingBothLegs) tumor += 10; // geel
    if (lrs >= 60) tumor += 30; else if (lrs >= 30) tumor += 10; // link met LRS
    tumor = clamp01(tumor);

    // Cauda Equina Syndroom (CES)
    let ces = 0;
    if (tri.incontinence) ces += 60; // donker rood
    if (tri.radiatingBothLegs) ces += 40; // rood
    if (tri.radiatingPastKnee) ces += 20; // laag verhoogd
    if (tri.burning) ces += 7.5; // licht geel
    if (tri.shooting) ces += 7.5;
    if (tri.numbness) ces += 20; // laag verhoogd
    const sudden: string[] = tri.suddenSymptoms || [];
    const suddenCritical = sudden?.some(s => s && !['Geen van bovenstaande', 'Geen', 'Weet ik niet'].includes(s));
    if (suddenCritical) ces += 60; // donker rood
    if (tri.touchPain) ces += 7.5;
    if (tri.coughWorse) ces += 7.5;
    if (age < 50 && obese) ces += 20; // geel
    if (recentSurgery) ces += 40; // rood
    ces = clamp01(ces);

    // Spinale infectie
    let infectie = 0;
    if (tri.fever) infectie += 30; // oranje
    if (tri.nightPain && tri.nightPainChange === false) infectie += 30; // niet-mechanische nachtelijke pijn
    if (recentSurgery) infectie += 60; // hoogste risicofactor
    if (meds.includes('corticosteroiden')) infectie += 30; // immunosuppressie proxy
    if (obese) infectie += 20; // geel
    if (cReuma) infectie += 20; // auto-immuunziekte
    infectie = clamp01(infectie);

    // Axiale SpA
    let spa = 0;
    if (tri.chronic && age < 45) spa += 20; // basis
    if (tri.nightPain) spa += 20; // nachtelijke pijn
    if (tri.nightPain && tri.nightPainChange === true) spa += 20; // verbetert met bewegen
    if (tri.morningStiffness) spa += 30; // >30 min
    if (tri.familyRheuma) spa += 20; // familiair
    const extra: string[] = tri.extraSymptoms || [];
    const extraCount = extra?.filter(e => e && !['Geen van bovenstaande', 'Geen'].includes(e)).length || 0;
    spa += Math.min(30, extraCount * 10); // max 30%
    if (tri.movementHelps) spa += 20; // 8.4
    if (tri.nsaidHelps) spa += 20; // 8.5
    spa = clamp01(spa);

    return {
      lrs,
      wervelfractuur: fx,
      tumor,
      ces,
      infectie,
      spa,
      flags: {
        cesImmediateReferral: tri.incontinence || suddenCritical,
      }
    };
  }, [answers]);

  if (!answers) return <div>Geen antwoorden ingevuld.</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-2xl font-bold">Evaluatie</div>
        {showBack && setView && (
          <button className="underline text-blue-600" onClick={() => setView('vragen')}>Terug naar vragen</button>
        )}
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-2">Risico op wervelfractuur</div>
        <div className={`inline-block px-3 py-1 rounded ${getLevelColor(evaluation?.wervelfractuur || 0)}`}>
          {evaluation?.wervelfractuur || 0}%
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-2">Risico op spinale maligniteit (tumor)</div>
        <div className={`inline-block px-3 py-1 rounded ${getLevelColor(evaluation?.tumor || 0)}`}>
          {evaluation?.tumor || 0}%
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-2">Risico op Cauda Equina Syndroom (CES)</div>
        <div className={`inline-block px-3 py-1 rounded ${getLevelColor(evaluation?.ces || 0)}`}>
          {evaluation?.ces || 0}%
        </div>
        {evaluation?.flags?.cesImmediateReferral && (
          <div className="mt-2 text-red-700 font-semibold">Rode vlag: overweeg directe verwijzing naar huisarts/SEH.</div>
        )}
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-2">Risico op spinale infectie</div>
        <div className={`inline-block px-3 py-1 rounded ${getLevelColor(evaluation?.infectie || 0)}`}>
          {evaluation?.infectie || 0}%
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-2">Risico op Axiale SpA</div>
        <div className={`inline-block px-3 py-1 rounded ${getLevelColor(evaluation?.spa || 0)}`}>
          {evaluation?.spa || 0}%
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-2">Waarschijnlijkheid op LRS</div>
        <div className={`inline-block px-3 py-1 rounded ${getLevelColor(evaluation?.lrs || 0)}`}>
          {evaluation?.lrs || 0}%
        </div>
      </Card>

      <div className="text-sm text-muted-foreground">Let op: deze evaluatie is een prototype en niet medisch gevalideerd.</div>
    </div>
  );
}
