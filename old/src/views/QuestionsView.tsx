import { TextInputQuestion, NumberInputQuestion, SelectQuestion, MultiSelectQuestion, YesNoQuestion } from "@/components";
import { useState, useEffect } from "react";
import type { Answers, Condition, Education, Gender, Medication } from "@/types/answers";

interface QuestionsViewProps {
  answers: Answers | null;
  setAnswers: (a: Answers) => void;
}

const educationOptions = [
  { value: "geen", label: "Geen opleiding" },
  { value: "basisonderwijs", label: "Basisonderwijs" },
  { value: "praktijk_mbo1_vmbob", label: "Praktijkonderwijs / MBO-1 / VMBO-B" },
  { value: "vmbo_t_mavo_mbo2_3", label: "VMBO-T / MAVO / MBO-2 / MBO-3" },
  { value: "havo_vwo_mbo4", label: "HAVO / VWO / MBO-4" },
  { value: "hbo_wo", label: "HBO / WO" },
];
const genderOptions = [
  { value: "man", label: "Man" },
  { value: "vrouw", label: "Vrouw" },
];
const dutchOptions = [
  { value: "ja", label: "Ja" },
  { value: "nee", label: "Nee" },
  { value: "hulp", label: "Nee, maar ik heb hulp bij me" },
];
const conditionOptions: { value: Condition; label: string }[] = [
  { value: "osteoporose", label: "Osteoporose / botontkalking" },
  { value: "diabetes", label: "Diabetes mellitus" },
  { value: "hartvaat", label: "Hart- of vaatziekten" },
  { value: "copd", label: "COPD of andere longziekte" },
  { value: "schildklier", label: "Schildklieraandoening" },
  { value: "migraine", label: "Migraine of hoofdpijnstoornis" },
  { value: "reuma", label: "Reuma, Bechterew of auto-immuunziekte" },
  { value: "crohn", label: "Ziekte van Crohn / PDS" },
  { value: "neuro", label: "Neurologische aandoening (MS, Parkinson, hernia, neuropathie)" },
  { value: "psych", label: "Psychische klachten of diagnose (depressie, angst, PTSS, burn-out)" },
  { value: "aandacht", label: "Aandachts- of prikkelverwerkingsstoornis (ADD, ADHD, HSP, ASS)" },
  { value: "kanker", label: "Kanker (in verleden of huidig)" },
  { value: "obesitas", label: "Overgewicht of obesitas" },
  { value: "anders", label: "Andere aandoening, namelijk:" },
];
const medicationOptions: { value: Medication; label: string }[] = [
  { value: "pijnstillers", label: "Pijnstillers / NSAID’s" },
  { value: "maagbeschermers", label: "Maagbeschermers" },
  { value: "bloedverdunners", label: "Bloedverdunners / antistolling" },
  { value: "betablokkers", label: "Bètablokkers" },
  { value: "corticosteroiden", label: "Corticosteroïden" },
  { value: "slaapmedicatie", label: "Slaapmedicatie" },
  { value: "antidepressiva", label: "Antidepressiva / angstremmers" },
  { value: "diabetesmedicatie", label: "Diabetesmedicatie" },
  { value: "chemo", label: "Chemotherapie / doelgerichte therapie" },
  { value: "hormonaal", label: "Hormonale therapie" },
  { value: "anders", label: "Andere medicatie:" },
];

export default function QuestionsView({ answers, setAnswers }: QuestionsViewProps) {
  const [local, setLocal] = useState<Answers>(
    answers || {
      gender: "",
      age: "",
      height: "",
      weight: "",
      dutch: "",
      education: "",
      conditions: [],
      otherCondition: "",
      medication: [],
      otherMedication: "",
      recentSurgery: null,
      surgeryDate: "",
      surgeryType: "",
      alcohol: { uses: null, amount: "", freq: "" },
      smoking: { uses: null, amount: "" },
      triage: {}
    }
  );
  useEffect(() => { setAnswers(local); }, [local, setAnswers]);

  // Gate: Vraag 8 only for age < 45 and chronic > 3 months
  const ageNum = typeof local.age === 'number' ? local.age : NaN;
  const isUnder45 = Number.isFinite(ageNum) && ageNum < 45;
  const canShowQ8 = isUnder45 && !!local.triage.chronic;

  // Clear 8.x answers when hidden
  useEffect(() => {
    if (!isUnder45 || !local.triage.chronic) {
      setLocal(a => ({
        ...a,
        triage: {
          ...a.triage,
          morningStiffness: undefined,
          familyRheuma: undefined,
          extraSymptoms: [],
          movementHelps: undefined,
          nsaidHelps: undefined,
        }
      }));
    }
  }, [isUnder45, local.triage.chronic]);

  return (
    <form className="space-y-8">
      <div className="text-2xl font-bold mb-2">Algemene gegevens</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectQuestion label="Geslacht" value={local.gender} onChange={v => setLocal(a => ({ ...a, gender: v as Gender }))} options={genderOptions} />
        <NumberInputQuestion label="Leeftijd (jaar)" value={local.age} onChange={v => setLocal(a => ({ ...a, age: v }))} />
        <NumberInputQuestion label="Lengte (cm)" value={local.height} onChange={v => setLocal(a => ({ ...a, height: v }))} />
        <NumberInputQuestion label="Gewicht (kg)" value={local.weight} onChange={v => setLocal(a => ({ ...a, weight: v }))} />
      </div>
  <SelectQuestion label="Woont u langer dan 10 jaar in Nederland en spreekt u voldoende Nederlands?" value={local.dutch} onChange={v => setLocal(a => ({ ...a, dutch: v as 'ja'|'nee'|'hulp'|'' }))} options={dutchOptions} />
      <SelectQuestion label="Wat is uw hoogste afgeronde opleidingsniveau?" value={local.education} onChange={v => setLocal(a => ({ ...a, education: v as Education }))} options={educationOptions} />
      <MultiSelectQuestion label="Heeft u andere aandoeningen of gezondheidsproblemen?" values={local.conditions} onChange={v => setLocal(a => ({ ...a, conditions: v as Condition[] }))} options={conditionOptions} />
      {local.conditions.includes("anders") && (
        <TextInputQuestion label="Andere aandoening, namelijk:" value={local.otherCondition || ''} onChange={v => setLocal(a => ({ ...a, otherCondition: v }))} />
      )}
      <MultiSelectQuestion label="Gebruikt u één van de onderstaande medicijnen?" values={local.medication} onChange={v => setLocal(a => ({ ...a, medication: v as Medication[] }))} options={medicationOptions} />
      {local.medication.includes("anders") && (
        <TextInputQuestion label="Andere medicatie:" value={local.otherMedication || ''} onChange={v => setLocal(a => ({ ...a, otherMedication: v }))} />
      )}
      <YesNoQuestion label="Heeft u recent een operatie gehad?" value={local.recentSurgery} onChange={v => setLocal(a => ({ ...a, recentSurgery: v }))} />
      {local.recentSurgery && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextInputQuestion label="Datum" value={local.surgeryDate || ''} onChange={v => setLocal(a => ({ ...a, surgeryDate: v }))} />
          <TextInputQuestion label="Type ingreep" value={local.surgeryType || ''} onChange={v => setLocal(a => ({ ...a, surgeryType: v }))} />
        </div>
      )}
      <div className="text-2xl font-bold mb-2">Alcoholgebruik en roken</div>
      <YesNoQuestion label="Drinkt u alcohol?" value={local.alcohol.uses} onChange={v => setLocal(a => ({ ...a, alcohol: { ...a.alcohol, uses: v } }))} />
      {local.alcohol.uses && (
        <div className="flex gap-2 items-end">
          <NumberInputQuestion label="Hoeveel glazen?" value={local.alcohol.amount} onChange={v => setLocal(a => ({ ...a, alcohol: { ...a.alcohol, amount: v } }))} />
          <SelectQuestion label="Per" value={local.alcohol.freq} onChange={v => setLocal(a => ({ ...a, alcohol: { ...a.alcohol, freq: v as 'dag'|'week'|'' } }))} options={[{ value: "dag", label: "dag" }, { value: "week", label: "week" }]} />
        </div>
      )}
      <YesNoQuestion label="Rookt u?" value={local.smoking.uses} onChange={v => setLocal(a => ({ ...a, smoking: { ...a.smoking, uses: v } }))} />
      {local.smoking.uses && (
        <NumberInputQuestion label="Hoeveel sigaretten per dag?" value={local.smoking.amount} onChange={v => setLocal(a => ({ ...a, smoking: { ...a.smoking, amount: v } }))} />
      )}
      <div className="text-2xl font-bold mb-2">Triage screening</div>
      <YesNoQuestion label="1. Zijn de klachten in de lage rug ontstaan direct na een val of ongeval?" value={local.triage.afterFall ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, afterFall: v } }))} />
      {local.triage.afterFall && (
        <>
          <SelectQuestion
            label="1.1 Betrof dit"
            value={local.triage.fallType || ''}
            onChange={v => setLocal(a => ({
              ...a,
              triage: {
                ...a.triage,
                fallType: v as 'a'|'b'|'c',
                fallOther: v === 'c' ? (a.triage.fallOther || '') : ''
              }
            }))}
            options={[
              { value: 'a', label: 'a) Val >1m of >5 treden' },
              { value: 'b', label: 'b) Directe impact op rug' },
              { value: 'c', label: 'c) Anders' }
            ]}
          />
          {local.triage.fallType === 'c' && (
            <TextInputQuestion
              label="1.1.c Anders, namelijk:"
              value={local.triage.fallOther || ''}
              onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, fallOther: v } }))}
              placeholder="Beschrijf de gebeurtenis"
            />
          )}
        </>
      )}
      <YesNoQuestion label="2. Is dit uw allereerste keer in uw leven dat u lage rugpijn heeft?" value={local.triage.firstTime ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, firstTime: v } }))} />
      <YesNoQuestion label="3. Voelt u zich de laatste tijd niet fit?" value={local.triage.notFit ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, notFit: v } }))} />
      <YesNoQuestion label="3.1. Recent last van koorts/rillingen/nachtzweten?" value={local.triage.fever ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, fever: v } }))} />
      <YesNoQuestion label="3.2. Onverklaard 5-10% afgevallen (3-6 maanden)?" value={local.triage.weightLoss ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, weightLoss: v } }))} />
      <YesNoQuestion label="4. Heeft u nachtelijke pijn?" value={local.triage.nightPain ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, nightPain: v } }))} />
      {local.triage.nightPain && (
        <YesNoQuestion label="4.1. Verandert die pijn met houding/beweging/uit bed?" value={local.triage.nightPainChange ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, nightPainChange: v } }))} />
      )}
      <YesNoQuestion label="5. Meer moeite plas/ontlasting op te houden?" value={local.triage.incontinence ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, incontinence: v } }))} />
      <YesNoQuestion label="6. Uitstralende pijn in beide benen?" value={local.triage.radiatingBothLegs ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, radiatingBothLegs: v } }))} />
      <YesNoQuestion label="7. Uitstralende pijn voorbij knie of beenpijn meer op de voorgrond?" value={local.triage.radiatingPastKnee ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, radiatingPastKnee: v } }))} />
      {local.triage.radiatingPastKnee && (
        <>
          <YesNoQuestion label="7.1 Branderig of prikkelend gevoel?" value={local.triage.burning ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, burning: v } }))} />
          <YesNoQuestion label="7.2 Heftige schietende pijnaanvallen?" value={local.triage.shooting ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, shooting: v } }))} />
          <YesNoQuestion label="7.3 Duidelijk krachtsverlies of doof gevoel?" value={local.triage.numbness ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, numbness: v } }))} />
          <MultiSelectQuestion label="7.3.1 Afgelopen 48u één of meer klachten?" values={local.triage.suddenSymptoms || []} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, suddenSymptoms: v as string[] } }))} options={[
            { value: 'Plotseling krachtverlies', label: 'Plotseling krachtverlies in één of beide benen' },
            { value: 'Toenemend gevoelsverlies', label: 'Toenemend gevoelsverlies of doof/tintelend gevoel' },
            { value: 'Toenemende moeite met lopen', label: 'Toenemende moeite met lopen' },
            { value: 'Spierkrampen of ongecontroleerde bewegingen', label: 'Spierkrampen / ongecontroleerde bewegingen' },
            { value: 'Geen van bovenstaande', label: 'Geen van bovenstaande' },
            { value: 'Weet ik niet', label: 'Weet ik niet' },
          ]} />
          <YesNoQuestion label="7.4 Is lichte aanraking/kou/warmte pijnlijk?" value={local.triage.touchPain ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, touchPain: v } }))} />
          <YesNoQuestion label="7.5 Worden klachten erger bij hoesten/niezen/persten?" value={local.triage.coughWorse ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, coughWorse: v } }))} />
        </>
      )}
      {isUnder45 && (
        <>
          <div className="text-xl font-semibold">Vraag 8 (alleen bij {'>'} 3 maanden en {'<'} 45 jaar)</div>
          <YesNoQuestion
            label="> 3 maanden lage rugpijn? (u bent jonger dan 45 jaar)"
            value={local.triage.chronic ?? null}
            onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, chronic: v } }))}
          />
        </>
      )}
      {canShowQ8 && (
        <>
          <YesNoQuestion label="8.1 Ochtendstijfheid > 30 min?" value={local.triage.morningStiffness ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, morningStiffness: v } }))} />
          <YesNoQuestion label="8.2 Komt reuma in uw familie voor?" value={local.triage.familyRheuma ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, familyRheuma: v } }))} />
          <MultiSelectQuestion label="8.3 Extra-articulaire verschijnselen" values={local.triage.extraSymptoms || []} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, extraSymptoms: v as string[] } }))} options={[
            { value: 'Psoriasis', label: 'Psoriasis' },
            { value: 'Oogontsteking', label: 'Oogontsteking' },
            { value: 'Chronische darmontsteking', label: 'Chronische darmontsteking' },
            { value: 'Achillespees/hiel pijn of stijfheid', label: 'Achillespees/hiel pijn of stijfheid' },
            { value: 'Geen van bovenstaande', label: 'Geen van bovenstaande' },
          ]} />
          <YesNoQuestion label="8.4 Verminderen klachten in beweging?" value={local.triage.movementHelps ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, movementHelps: v } }))} />
          <YesNoQuestion label="8.5 Helpen NSAIDs goed en snel?" value={local.triage.nsaidHelps ?? null} onChange={v => setLocal(a => ({ ...a, triage: { ...a.triage, nsaidHelps: v } }))} />
        </>
      )}
    </form>
  );
}
