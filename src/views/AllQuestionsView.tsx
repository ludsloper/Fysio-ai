import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  ChevronDown,
  Activity,
  AlertCircle,
  Brain,
  Moon,
  Briefcase,
  Stethoscope,
  Pill as PillIcon,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectQuestion, MultiSelectQuestion, YesNoQuestion } from '@/components';

export type FUType = 'yesno' | 'select' | 'multiselect' | 'text' | 'number';
export type FollowUpOption = { value: string; label: string };
export type FollowUpQuestion = {
  id: string;
  type: FUType;
  label: string;
  options?: FollowUpOption[];
  placeholder?: string;
};
export type FollowUpAnswer = boolean | string | number | string[] | null;

type Agree = '' | 'eens' | 'oneens';
type Language = '' | 'ja' | 'nee' | 'hulp';
type Education = '' | 'geen' | 'basisonderwijs' | 'praktijk_mbo1_vmbob' | 'vmbo_t_mavo_mbo2_3' | 'havo_vwo_mbo4' | 'hbo_wo';
type HomeSituation = '' | 'alleen' | 'samen_zonder' | 'samen_met' | 'alleen_met' | 'anders';
type Duration = '' | 'lt6w' | '6 weken – 3 maanden' | '3 – 12 maanden' | 'gt12m';
type Severity = '' | 'niet' | 'beetje' | 'matig' | 'erg' | 'extreem';
type Sleep = '' | 'zeer_goed' | 'goed' | 'matig' | 'slecht' | 'zeer_slecht';

type Condition =
  | 'osteoporose'
  | 'diabetes'
  | 'hartvaat'
  | 'copd'
  | 'schildklier'
  | 'migraine'
  | 'reuma'
  | 'crohn_pds'
  | 'neuro'
  | 'psych'
  | 'aandacht'
  | 'kanker'
  | 'obesitas'
  | 'anders';

type Medication =
  | 'pijnstillers'
  | 'maagbeschermers'
  | 'bloedverdunners'
  | 'betablokkers'
  | 'corticosteroiden'
  | 'slaapmedicatie'
  | 'antidepressiva'
  | 'diabetesmedicatie'
  | 'chemo'
  | 'hormonaal'
  | 'anders';

interface Answers {
  // Persoonsgegevens
  gender: '' | 'man' | 'vrouw';
  age: number | '';
  language: Language;
  // 1
  education: Education;
  // 2
  work: string; // beroep/functie en uren p/w
  // 3
  hobbies: [string, string, string];
  // 4
  sport: { name: string; hoursPerWeek: number | '' };
  // 5
  home: { situation: HomeSituation; other?: string };
  // 6
  duration: Duration;
  // 7
  hindrance: Severity;
  // 8-10 + 12-13 yes/no + agree/disagree
  radiatingToLegs: Agree; // eens/oneens
  worried: Agree;
  unsafeActive: Agree;
  coping: 'avoid' | 'push_through' | 'pacing' | '';
  copingAvoidDetails?: string;
  irritable: boolean | null;
  rumination: boolean | null;
  enjoyDespitePain: Agree;
  lessSocial: Agree;
  depressed: Agree;
  // 16 sleep
  sleepQuality: Sleep;
  // 17-19
  workStress: boolean | null;
  privateEvents: boolean | null;
  expectInfluence: boolean | null;
  // 20-21
  conditions: { values: Condition[]; other?: string };
  medication: { values: Medication[]; other?: string };
}

const agreeOptions = [
  { value: 'oneens', label: 'Oneens' },
  { value: 'eens', label: 'Eens' },
] as const;

export default function AllQuestionsView({ apiKey }: { apiKey: string }) {
  const [answers, setAnswers] = useState<Answers>({
    gender: '',
    age: '',
    language: '',
    education: '',
    work: '',
    hobbies: ['', '', ''],
    sport: { name: '', hoursPerWeek: '' },
    home: { situation: '' },
    duration: '',
    hindrance: '',
    radiatingToLegs: '',
    worried: '',
    unsafeActive: '',
    coping: '',
    copingAvoidDetails: '',
    irritable: null,
    rumination: null,
    enjoyDespitePain: '',
    lessSocial: '',
    depressed: '',
    sleepQuality: '',
    workStress: null,
    privateEvents: null,
    expectInfluence: null,
    conditions: { values: [] },
    medication: { values: [] },
  });

  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, FollowUpAnswer>>({});
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpActive, setFollowUpActive] = useState(false);
  const regenTimer = useRef<number | null>(null);

  const defaultFollowUpInstruction = 'Genereer tot maximaal 10 vervolgvragen\nop basis van de gegeven basis vraag en antwoorden.\n';
  const [followUpInstruction, setFollowUpInstruction] = useState<string>(defaultFollowUpInstruction);
  const [instructionOpen, setInstructionOpen] = useState(false);

  // const canDownload = useMemo(() => true, []);
  const [showAdvice] = useState(false);
  const requiredOk = (answers.age !== '' && answers.duration !== '');
  // Samenvatting-functie tijdelijk uitgeschakeld

  function update<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((prev: Answers) => ({ ...prev, [key]: value }));
  }

  // Download JSON helper (momenteel niet in gebruik)

  function setFUAnswer(id: string, value: FollowUpAnswer) {
    setFollowUpAnswers(prev => ({ ...prev, [id]: value }));
  }

  async function handleGenerateFollowUps() {
    if (!apiKey) {
      setFollowUpError('Geen API key beschikbaar.');
      return;
    }
    setFollowUpActive(true);
    await generateFollowUps(answers, apiKey, followUpInstruction, setFollowUpQuestions, setFollowUpAnswers, setFollowUpLoading, setFollowUpError);
  }

  // Auto-regenerate on standard answers change when follow-ups active (debounced)
  useEffect(() => {
    if (!followUpActive) return;
    if (regenTimer.current) window.clearTimeout(regenTimer.current);
    regenTimer.current = window.setTimeout(() => {
      if (!apiKey) return;
      generateFollowUps(answers, apiKey, followUpInstruction, setFollowUpQuestions, setFollowUpAnswers, setFollowUpLoading, setFollowUpError);
    }, 600);
    return () => {
      if (regenTimer.current) window.clearTimeout(regenTimer.current);
    };
  }, [answers, followUpActive, followUpInstruction, apiKey]);

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Fysio Intake – Vragenlijst</h1>
        <Button variant="outline" onClick={() => setInstructionOpen(true)}>Vervolgvragen AI instructie</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Persoonsgegevens</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Geslacht</Label>
            <SelectQuestion
              label=""
              value={answers.gender}
              onChange={v => update('gender', v as Answers['gender'])}
              options={[
                { value: 'man', label: 'Man' },
                { value: 'vrouw', label: 'Vrouw' },
              ]}
              placeholder="Kies geslacht"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Leeftijd (jaren)</Label>
            <Input
              type="number"
              value={answers.age}
              onChange={(e: ChangeEvent<HTMLInputElement>) => update('age', e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Bijv. 45"
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <Label>
          Spreekt u voldoende Nederlands om medische informatie goed te begrijpen? (zodat we onze uitleg goed kunnen afstemmen op uw situatie)
        </Label>
  <SelectQuestion
          label=""
          value={answers.language}
          onChange={v => update('language', v as Language)}
          options={[
            { value: 'ja', label: 'Ja' },
            { value: 'nee', label: 'Nee' },
            { value: 'hulp', label: 'Nee, maar ik heb hulp bij het invullen' },
          ]}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">1. Opleidingsniveau</h2>
        <SelectQuestion
          label="Wat is uw hoogste afgeronde opleidingsniveau (gezondheidsvaardigheden)?"
          value={answers.education}
          onChange={v => update('education', v as Education)}
          options={[
            { value: 'geen', label: 'Geen opleiding' },
            { value: 'basisonderwijs', label: 'Basisonderwijs' },
            { value: 'praktijk_mbo1_vmbob', label: 'Praktijkonderwijs / MBO-1 / VMBO-B' },
            { value: 'vmbo_t_mavo_mbo2_3', label: 'VMBO-T / MAVO / MBO-2 / MBO-3' },
            { value: 'havo_vwo_mbo4', label: 'HAVO / VWO / MBO-4' },
            { value: 'hbo_wo', label: 'HBO / WO' },
          ]}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">2. Werk</h2>
        <Input
          placeholder="Beroep/functie en aantal uren per week"
          value={answers.work}
          onChange={(e: ChangeEvent<HTMLInputElement>) => update('work', e.target.value)}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">3. Hobby’s of bezigheden</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {answers.hobbies.map((hobby, i) => (
            <Input
              key={i}
              placeholder={`Hobby ${i + 1}`}
              value={hobby}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const next = [...answers.hobbies] as Answers['hobbies'];
                next[i] = e.target.value;
                update('hobbies', next);
              }}
            />
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">4. Sport</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Welke sport?"
              value={answers.sport.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => update('sport', { ...answers.sport, name: e.target.value })}
              autoComplete="off"
              name="sport_name"
            />
          </div>
          <div>
            <Input
              type="number"
              placeholder="Uren per week"
              value={answers.sport.hoursPerWeek}
              onChange={(e: ChangeEvent<HTMLInputElement>) => update('sport', { ...answers.sport, hoursPerWeek: e.target.value === '' ? '' : Number(e.target.value) })}
              autoComplete="off"
              inputMode="numeric"
              pattern="[0-9]*"
              name="sport_hours_per_week"
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">5. Thuissituatie</h2>
        <SelectQuestion
          label="Wat is uw huidige thuissituatie?"
          value={answers.home.situation}
          onChange={v => update('home', { ...answers.home, situation: v as HomeSituation })}
          options={[
            { value: 'alleen', label: 'Alleenwonend' },
            { value: 'samen_zonder', label: 'Samenwonend zonder kinderen' },
            { value: 'samen_met', label: 'Samenwonend met kinderen' },
            { value: 'alleen_met', label: 'Alleenstaand met kinderen' },
            { value: 'anders', label: 'Anders, namelijk…' },
          ]}
        />
        {answers.home.situation === 'anders' && (
          <Input
            placeholder="Toelichting thuissituatie"
            value={answers.home.other || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) => update('home', { ...answers.home, other: e.target.value })}
          />
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">6. Duur rugklachten</h2>
        <SelectQuestion
          label="Hoelang heeft u al rugklachten?"
          value={answers.duration}
          onChange={v => update('duration', v as Duration)}
          options={[
            { value: 'lt6w', label: 'Minder dan 6 weken' },
            { value: '6 weken – 3 maanden', label: '6 weken – 3 maanden' },
            { value: '3 – 12 maanden', label: '3 – 12 maanden' },
            { value: 'gt12m', label: 'Langer dan 12 maanden' },
          ]}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">7. Hinder</h2>
        <SelectQuestion
          label="Over het geheel genomen, hoe hinderlijk was uw rugpijn in de laatste 2 weken?"
          value={answers.hindrance}
          onChange={v => update('hindrance', v as Severity)}
          options={[
            { value: 'niet', label: 'In het geheel niet' },
            { value: 'beetje', label: 'Een beetje' },
            { value: 'matig', label: 'Matig' },
            { value: 'erg', label: 'Erg' },
            { value: 'extreem', label: 'Extreem' },
          ]}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">8–10. Cognities/symptomen</h2>
        <SelectQuestion
          label="In de laatste 2 weken straalde mijn rugpijn wel eens uit naar één of beide benen?"
          value={answers.radiatingToLegs}
          onChange={v => update('radiatingToLegs', v as Agree)}
          options={[...agreeOptions]}
        />
        <SelectQuestion
          label="Ik maak mij grote zorgen over mijn rugklachten?"
          value={answers.worried}
          onChange={v => update('worried', v as Agree)}
          options={[...agreeOptions]}
        />
        <SelectQuestion
          label="Door mijn rugklachten vind ik het niet veilig om lichamelijk actief te zijn?"
          value={answers.unsafeActive}
          onChange={v => update('unsafeActive', v as Agree)}
          options={[...agreeOptions]}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">11. Coping</h2>
        <SelectQuestion
          label="In de praktijk zien wij dat mensen verschillend omgaan met rugpijn. Wat past het beste bij u?"
          value={answers.coping}
          onChange={v => update('coping', v as Answers['coping'])}
          options={[
            { value: 'avoid', label: 'Ik vermijd bewegingen en activiteiten die pijn geven, ik ben erg voorzichtig' },
            { value: 'push_through', label: 'Ik ga door met alles en negeer de pijn, ook als het klachten geeft' },
            { value: 'pacing', label: 'Ik probeer een middenweg te kiezen: blijven bewegen zonder over grenzen te gaan' },
          ]}
        />
        {answers.coping === 'avoid' && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Zo ja, welke bewegingen/activiteiten vermijdt u?</Label>
            <textarea
              className="w-full min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
              placeholder="Bijvoorbeeld bukken, tillen, lang zitten..."
              value={answers.copingAvoidDetails || ''}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update('copingAvoidDetails', e.target.value)}
            />
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">12–13. Emoties/stress</h2>
        <YesNoQuestion
          label="Bent u de laatste tijd prikkelbaarder of emotioneler dan normaal?"
          value={answers.irritable}
          onChange={v => update('irritable', v)}
        />
        <YesNoQuestion
          label="Heeft u last van piekeren, malen of nadenken zonder dat u dat kunt stoppen?"
          value={answers.rumination}
          onChange={v => update('rumination', v)}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">14–15. Somberheid/sociaal</h2>
        <SelectQuestion
          label="Kunt u ondanks uw rugklachten nog plezier of zin ervaren in dingen die u doet?"
          value={answers.enjoyDespitePain}
          onChange={v => update('enjoyDespitePain', v as Agree)}
          options={[...agreeOptions]}
        />
        <SelectQuestion
          label="De laatste tijd heb ik minder behoefte of mogelijkheden om sociale dingen te doen?"
          value={answers.lessSocial}
          onChange={v => update('lessSocial', v as Agree)}
          options={[...agreeOptions]}
        />
        <SelectQuestion
          label="De laatste tijd voel ik me neerslachtig of depressief"
          value={answers.depressed}
          onChange={v => update('depressed', v as Agree)}
          options={[...agreeOptions]}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">16. Slaap</h2>
        <SelectQuestion
          label="Over het geheel genomen, hoe ervaarde u uw slaapkwaliteit in de laatste 2 weken?"
          value={answers.sleepQuality}
          onChange={v => update('sleepQuality', v as Sleep)}
          options={[
            { value: 'zeer_goed', label: 'Zeer goed' },
            { value: 'goed', label: 'Goed' },
            { value: 'matig', label: 'Matig' },
            { value: 'slecht', label: 'Slecht' },
            { value: 'zeer_slecht', label: 'Zeer slecht' },
          ]}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">17–19. Werk/leven/verwachting</h2>
        <YesNoQuestion
          label="Ervaart u de laatste tijd werkdruk, stress of andere problemen in uw werk?"
          value={answers.workStress}
          onChange={v => update('workStress', v)}
        />
        <YesNoQuestion
          label="Heeft u de laatste tijd ingrijpende gebeurtenissen of spanningen in uw privéleven ervaren (bijvoorbeeld relatie, gezin, gezondheid, financiën)?"
          value={answers.privateEvents}
          onChange={v => update('privateEvents', v)}
        />
        <YesNoQuestion
          label="Verwacht u nog dat er invloed is uit te oefenen op deze rugklachten?"
          value={answers.expectInfluence}
          onChange={v => update('expectInfluence', v)}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">20. Aandoeningen</h2>
        <MultiSelectQuestion
          label="Heeft u andere aandoeningen of gezondheidsproblemen? (meerdere opties mogelijk)"
          values={answers.conditions.values as string[]}
          onChange={vals => update('conditions', { ...answers.conditions, values: vals as Condition[] })}
          options={[
            { value: 'osteoporose', label: 'Osteoporose / botontkalking' },
            { value: 'diabetes', label: 'Diabetes mellitus' },
            { value: 'hartvaat', label: 'Hart- of vaatziekten' },
            { value: 'copd', label: 'COPD of andere longziekte' },
            { value: 'schildklier', label: 'Schildklieraandoening' },
            { value: 'migraine', label: 'Migraine of hoofdpijnstoornis' },
            { value: 'reuma', label: 'Reuma, Bechterew of auto-immuunziekte' },
            { value: 'crohn_pds', label: 'Ziekte van Crohn / PDS' },
            { value: 'neuro', label: 'Neurologische aandoening (MS, Parkinson, hernia, neuropathie)' },
            { value: 'psych', label: 'Psychische klachten of diagnose (depressie, angst, PTSS, burn-out)' },
            { value: 'aandacht', label: 'Aandachts-/prikkelverwerkingsstoornis (ADD, ADHD, HSP, ASS)' },
            { value: 'kanker', label: 'Kanker (verleden of huidig)' },
            { value: 'obesitas', label: 'Overgewicht of obesitas' },
            { value: 'anders', label: 'Andere aandoening' },
          ]}
        />
        {answers.conditions.values.includes('anders') && (
          <Input
            placeholder="Specificeer andere aandoening"
            value={answers.conditions.other || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) => update('conditions', { ...answers.conditions, other: e.target.value })}
          />
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">21. Medicatie</h2>
        <MultiSelectQuestion
          label="Gebruikt u één van de onderstaande medicijnen? (meerdere antwoorden mogelijk)"
          values={answers.medication.values as string[]}
          onChange={vals => update('medication', { ...answers.medication, values: vals as Medication[] })}
          options={[
            { value: 'pijnstillers', label: 'Pijnstillers / NSAID’s' },
            { value: 'maagbeschermers', label: 'Maagbeschermers' },
            { value: 'bloedverdunners', label: 'Bloedverdunners / antistolling' },
            { value: 'betablokkers', label: 'Bètablokkers' },
            { value: 'corticosteroiden', label: 'Corticosteroïden' },
            { value: 'slaapmedicatie', label: 'Slaapmedicatie' },
            { value: 'antidepressiva', label: 'Antidepressiva / angstremmers' },
            { value: 'diabetesmedicatie', label: 'Diabetesmedicatie' },
            { value: 'chemo', label: 'Chemotherapie / doelgerichte therapie' },
            { value: 'hormonaal', label: 'Hormonale therapie' },
            { value: 'anders', label: 'Andere medicatie' },
          ]}
        />
        {answers.medication.values.includes('anders') && (
          <Input
            placeholder="Specificeer andere medicatie"
            value={answers.medication.other || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) => update('medication', { ...answers.medication, other: e.target.value })}
          />
        )}
      </Card>

      <div className="flex items-center gap-2">
        {/* <Button onClick={downloadJSON} disabled={!canDownload}>Opslaan als JSON</Button> */}
        <Button onClick={handleGenerateFollowUps} >
          {followUpLoading ? 'Vervolg vragen laden…' : 'Vervolg vragen'}
        </Button>
        {/* <div className="text-xs text-muted-foreground">Downloadt uw antwoorden lokaal als JSON-bestand of genereer vervolgvragen.</div> */}
      </div>

      <div className="flex items-center gap-2">
        {/* <Button onClick={() => setShowAdvice(v => !v)} disabled={!requiredOk} variant={showAdvice ? 'default' : 'outline'}>
          {showAdvice ? 'Verberg persoonlijk advies' : 'Bekijk persoonlijk advies'}
        </Button> */}
        {!requiredOk && (
          <div className="text-xs text-muted-foreground">Vul minimaal leeftijd en duur van klachten in om advies te tonen.</div>
        )}
      </div>

      {showAdvice && (
        <AdvicePanel answers={answers} />
      )}

      {/* Summary UI tijdelijk uitgeschakeld
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Samenvatting </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 flex items-center gap-2">
            <Button onClick={() => generateSummary(answers, apiKey, setSummary, setLoadingSummary, setSummaryError)}>
              {loadingSummary ? 'Samenvatting laden…' : 'Genereer samenvatting'}
            </Button>
          </div>
        </div>
        {summaryError && <div className="text-sm text-red-600">{summaryError}</div>}
        {summary && (
          <div className="rounded-md border border-border p-3">
            <pre className="whitespace-pre-wrap text-sm">{summary}</pre>
          </div>
        )}
      </Card>
      */}
        </div>
        {/* Right panel: follow-up questions */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold">Vervolgvragen</h2>
            {followUpError && <div className="text-sm text-red-600">{followUpError}</div>}
            {!followUpActive && (
              <div className="text-sm text-muted-foreground">Klik op "Vervolg vragen" om AI-gegenereerde vervolgvragen te zien.</div>
            )}
            {followUpActive && followUpLoading && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                  <div>
                    <p className="text-sm font-medium">We genereren uw vervolgvragen…</p>
                    <p className="text-xs text-muted-foreground">Bedankt voor het invullen van de standaardvragen, we verwerken uw antwoorden.</p>
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-md border border-border p-3 animate-pulse bg-muted/40 h-16" />
                  <div className="rounded-md border border-border p-3 animate-pulse bg-muted/40 h-16" />
                  <div className="rounded-md border border-border p-3 animate-pulse bg-muted/40 h-16" />
                </div>
              </div>
            )}
            {followUpActive && !followUpLoading && followUpQuestions.length === 0 && (
              <div className="text-sm text-muted-foreground">Geen vervolgvragen gegenereerd.</div>
            )}
            <div className="space-y-4">
              {followUpQuestions.map(q => (
                <div key={q.id}>
                  {q.type === 'yesno' && (
                    <YesNoQuestion
                      label={q.label}
                      value={(followUpAnswers[q.id] as boolean | null) ?? null}
                      onChange={(v) => setFUAnswer(q.id, v)}
                    />
                  )}
                  {q.type === 'select' && (
                    <SelectQuestion
                      label={q.label}
                      value={(followUpAnswers[q.id] as string) || ''}
                      onChange={(v) => setFUAnswer(q.id, v)}
                      options={(q.options || []) as { value: string; label: string }[]}
                      placeholder={q.placeholder}
                    />
                  )}
                  {q.type === 'multiselect' && (
                    <MultiSelectQuestion
                      label={q.label}
                      values={Array.isArray(followUpAnswers[q.id]) ? (followUpAnswers[q.id] as string[]) : []}
                      onChange={(vals) => setFUAnswer(q.id, vals)}
                      options={(q.options || []) as { value: string; label: string }[]}
                    />
                  )}
                  {q.type === 'text' && (
                    <div className="space-y-2">
                      <Label>{q.label}</Label>
                      <Input
                        placeholder={q.placeholder || ''}
                        value={(followUpAnswers[q.id] as string) || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setFUAnswer(q.id, e.target.value)}
                      />
                    </div>
                  )}
                  {q.type === 'number' && (
                    <div className="space-y-2">
                      <Label>{q.label}</Label>
                      <Input
                        type="number"
                        placeholder={q.placeholder || ''}
                        value={
                          (typeof followUpAnswers[q.id] === 'number'
                            ? (followUpAnswers[q.id] as number)
                            : '')
                        }
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setFUAnswer(q.id, e.target.value === '' ? '' : Number(e.target.value))}
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {instructionOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setInstructionOpen(false)} />
          <div className="absolute inset-0 grid place-items-center p-4">
            <Card className="w-full max-w-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Vervolgvragen AI instructie</h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setFollowUpInstruction(defaultFollowUpInstruction)}>Reset</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Instructie (wordt gecombineerd met vaste JSON-formatregels)</Label>
                <textarea
                  className="w-full min-h-48 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                  value={followUpInstruction}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFollowUpInstruction(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setInstructionOpen(false)}>Annuleer</Button>
                <Button onClick={() => setInstructionOpen(false)}>Opslaan</Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function AdvicePanel({ answers }: { answers: Answers }) {
  const acute = answers.duration === 'lt6w';
  const subchronic = answers.duration === '6 weken – 3 maanden' || answers.duration === '3 – 12 maanden';
  const chronic = answers.duration === 'gt12m';
  const hinderlijk = answers.hindrance === 'erg' || answers.hindrance === 'extreem';
  const uitstraling = answers.radiatingToLegs === 'eens';
  const cognitief = answers.worried === 'eens' || answers.unsafeActive === 'eens';
  const stress = answers.irritable === true || answers.rumination === true;
  const slechtSlapen = ['matig', 'slecht', 'zeer_slecht'].includes(answers.sleepQuality);
  const werkLeven = answers.workStress === true || answers.privateEvents === true;
  const heeftCondities = (answers.conditions.values?.length ?? 0) > 0;
  const heeftMedicatie = (answers.medication.values?.length ?? 0) > 0;

  function Pill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'green' | 'amber' | 'red' | 'blue' | 'purple' }) {
    const toneMap: Record<string, string> = {
      default: 'bg-muted text-foreground',
      green: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-300',
      amber: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300',
      red: 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-300',
      blue: 'bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-300',
      purple: 'bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-300',
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneMap[tone]}`}>{label}</span>
    );
  }

  function SectionTitle({ icon: Icon, title, tone = 'default' }: { icon: LucideIcon; title: string; tone?: 'default' | 'blue' | 'green' | 'amber' | 'purple' | 'red' }) {
    const ringColor =
      tone === 'green'
        ? 'text-emerald-600 bg-emerald-500/10'
        : tone === 'amber'
          ? 'text-amber-600 bg-amber-500/10'
          : tone === 'red'
            ? 'text-red-600 bg-red-500/10'
          : tone === 'purple'
            ? 'text-violet-600 bg-violet-500/10'
            : 'text-sky-600 bg-sky-500/10';
    return (
      <div className="flex items-center gap-2">
        <div className={`h-8 w-8 rounded-full grid place-items-center ${ringColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-semibold leading-none">{title}</h3>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3 bg-muted/30">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SectionTitle icon={Activity} title="Wat betekent dit voor u?" tone="blue" />
            <div className="flex items-center gap-1.5 flex-wrap">
              <Pill label={acute ? 'Fase: acuut' : subchronic ? 'Fase: subchronisch' : chronic ? 'Fase: chronisch' : 'Fase: n.b.'} tone="blue" />
              {hinderlijk && <Pill label="Hinderlijk" tone="amber" />}
              {uitstraling && <Pill label="Uitstraling" tone="purple" />}
              {cognitief && <Pill label="Cognities" tone="green" />}
              {stress && <Pill label="Stress/Emotie" tone="amber" />}
              {slechtSlapen && <Pill label="Slaap" tone="purple" />}
              {werkLeven && <Pill label="Werk/privé" tone="blue" />}
              {(heeftCondities || heeftMedicatie) && <Pill label="Medisch" tone="red" />}
            </div>
          </div>
            {acute ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Bij kort bestaande lage rugklachten herstelt de overgrote meerderheid binnen 6–12 weken zonder blijvende schade. De pijn kan fel aanvoelen, maar staat zelden gelijk aan schade. Het belangrijkste is rustig in beweging blijven, houdingen afwisselen en dagelijkse activiteiten stap voor stap hervatten.
                </p>
                <p className="text-sm text-muted-foreground">
                  Praktisch begin: kies 2–3 basisactiviteiten (bijv. wandelen, kort zitten werken, lichte huishouden) en start klein (bijv. 5–10 minuten). Verhoog om de 2–3 dagen met 5–10% zolang napijn beheersbaar blijft (bijvoorbeeld binnen 24 uur afneemt en niet boven uw normale niveau uitkomt). Bedrust is meestal niet zinvol en kan herstel vertragen.
                </p>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>Wissel elk 20–30 min. van houding (zitten–staan–lopen).</li>
                  <li>Korte, frequente beweegmomenten werken beter dan één groot blok.</li>
                  <li>Licht ongemak is oké; scherpe pijn of duidelijke toename? Stap een niveau terug.</li>
                </ul>
                <ExpandSection title="Meer uitleg">
                  <p className="text-sm text-muted-foreground">
                    Pijn is een beschermend signaal van uw lichaam en zegt niet altijd iets over schade. Uw “beschermingsmeter” (brein) reageert op prikkels zoals belasting, stress en slaap. Als er meer veiligheidssignalen zijn (rust, beweging binnen grenzen, geruststelling) zakt de meter en neemt pijn vaak af.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Bij aspecifieke acute rugpijn is ernstige pathologie zeldzaam. Scans zijn zelden nodig. Door regelmatig te bewegen, kort te zitten en vaak te wisselen van houding ondersteunt u het natuurlijke herstel. Bouw pas op als het voorgaande niveau goed gaat.
                  </p>
                </ExpandSection>
              </>
            ) : subchronic ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Uw klachten bestaan enkele weken tot maanden. Herstel is nog steeds zeer goed mogelijk. Vaak spelen meerdere factoren mee (belasting, slaap, stress, verwachtingen). Door systematisch te doseren (pacing), kleine stappen te plannen en herstelgewoonten te versterken, krijgt u weer grip op belasting en belastbaarheid.
                </p>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>Werk met vaste, haalbare weekdoelen (bijv. 3×/week 15 min wandelen).</li>
                  <li>Monitor napijn: houdt u de dag erop hetzelfde plan aan als napijn binnen 24 uur normaliseert.</li>
                  <li>Check belemmeraars: slaapkwaliteit, piekeren, werkdruk; pak 1 punt tegelijk aan.</li>
                </ul>
                <ExpandSection title="Meer uitleg">
                  <p className="text-sm text-muted-foreground">
                    Na de eerste weken kunnen meerdere factoren de rug gevoeliger houden: vermoeidheid, slaappatroon, zorgen of onregelmatige belasting. Door klein, consequent en meetbaar op te bouwen leert uw zenuwstelsel weer vertrouwen.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Richt u per week op een paar haalbare doelen, evalueer nuchter, en vermeid de valkuil van “alles of niets”. Liever 5 goede dagen met kleine stappen dan 1 grote sprong gevolgd door terugval.
                  </p>
                </ExpandSection>
              </>
            ) : chronic ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Bij langer bestaande rugklachten is de rug meestal niet kapot, maar overgevoelig geraakt. De zenuwen en het pijnsysteem slaan sneller alarm. Goed nieuws: u kunt dit systeem weer “trainen” door voorspelbare, kleine en consistente opbouw. Bewegen is doorgaans veilig en helpt het alarmsysteem te kalmeren.
                </p>
                <ExpandSection title="Meer uitleg">
                  <p className="text-sm text-muted-foreground">
                    Bij aanhoudende klachten is sensitisatie (gevoeligheid van het pijnsysteem) vaak een sleutel. Dat betekent dat het alarmsysteem sneller aanslaat. U kunt dit weer “trainen” met voorspelbare, kleine en herhaalde prikkels – vergelijkbaar met het opbouwen van conditie.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Consistentie is belangrijker dan snelheid. Combineer bewegen met beter slapen en stressregulatie; zo kantelt de beschermingsmeter richting veiligheid en daalt de pijngevoeligheid.
                  </p>
                </ExpandSection>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>Graded activity: kies 1–2 activiteiten en verhoog consequent met kleine stappen (5–10%).</li>
                  <li>Houd een eenvoudig schema bij (activiteit, tijd, napijn-score); stabiliteit boven snelheid.</li>
                  <li>Combineer met slaapoptimalisatie en stressregulatie voor het beste effect.</li>
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Vul a.u.b. de duur van uw klachten in voor een persoonlijker advies.</p>
            )}
        </div>
        {hinderlijk && (
          <div className="text-sm rounded-md border border-border p-3 space-y-1 bg-amber-50 dark:bg-amber-900/10">
            <p className="mb-1 font-medium flex items-center gap-1.5"><AlertCircle className="h-4 w-4 text-amber-600" /> Hinder: praktische dosering</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Opbouw: 5–10% per 2–3 dagen; liever dagelijks klein dan af en toe groot.</li>
              <li>Pijnrichtlijn: lichte tot matige toename (bijv. 0–3/10) is oké; duidelijke toename of lang aanhoudende napijn? Stap 1 niveau terug.</li>
              <li>Plan 2–3 micro-pauzes per uur (1–2 min staan/lopen/ademen).</li>
            </ul>
          </div>
        )}
        {uitstraling && (
          <div className="text-sm rounded-md border border-border p-3 space-y-1 bg-violet-50 dark:bg-violet-900/10">
            <p className="mb-1 font-medium flex items-center gap-1.5"><Stethoscope className="h-4 w-4 text-violet-600" /> Uitstraling naar been/benen</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Blijf bewegen binnen grenzen; rustige, herhaalde bewegingen zijn meestal veilig.</li>
              <li>Geef dit door aan uw behandelaar; samen bewaken we kracht/gevoel en passen we belasting aan.</li>
              <li>Neem laagdrempelig contact op bij duidelijke krachtuitval, doof gevoel in het zadelgebied of plas-/poepproblemen.</li>
            </ul>
          </div>
        )}
      </Card>

      {cognitief && (
        <Card className="p-4 space-y-2">
          <SectionTitle icon={Brain} title="Cognities: veilig blijven bewegen" tone="green" />
          <p className="text-sm text-muted-foreground">Gedachten kleuren uw pijnervaring. Helpende gedachten geven veiligheid en ruimte om te bewegen.</p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>Pijn ≠ schade: bewegen in kleine stappen is doorgaans veilig én nuttig.</li>
            <li>Herformuleer: van “het gaat mis” naar “ik bouw rustig en slim op”.</li>
            <li>Focus op wat lukt vandaag; vergelijk uzelf niet met “vroeger”.</li>
          </ul>
          <div className="text-xs text-muted-foreground mt-1">Voorbeeld: “Als ik 10 minuten kan wandelen zonder toename die langer dan 24 uur aanhoudt, voeg ik 1–2 minuten toe.”</div>
          <ExpandSection title="Meer uitleg">
            <p className="text-sm text-muted-foreground">
              Gevaar-signalen (GIMs) zoals angstige gedachten kunnen het pijnsysteem activeren. Veiligheidssignalen (VIMs) – zoals positieve herformuleringen en haalbare successen – dempen dit. Door bewust helpende gedachten te kiezen vergroot u de kans op soepel herstel.
            </p>
          </ExpandSection>
        </Card>
      )}

      {stress && (
        <Card className="p-4 space-y-2">
          <SectionTitle icon={AlertCircle} title="Emoties & stress: demp de rookmelder" tone="amber" />
          <p className="text-sm text-muted-foreground">Wanneer spanning oploopt, gaat de interne “rookmelder” sneller af. Korte, regelmatige ontprikkelmomenten helpen direct.</p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>2–3×/dag 5–10 min ontladen: adem rustig (4–6), maak een korte wandeling, schouders/nek los.</li>
            <li>Plan micro-herstel: na elke 30 min. taak 2–3 min. bewegen of ademen.</li>
            <li>Noteer zorgen en bespreek wat u beïnvloedt; laat los wat buiten uw controle valt.</li>
          </ul>
          <ExpandSection title="Meer uitleg">
            <p className="text-sm text-muted-foreground">
              Het doel is uw systeem te “ontprikkelen”. Korte, regelmatige momenten werken beter dan één lang moment. Denk aan 3× per dag 10 minuten rustig bewegen of ontspannen. Combineer dit met lichte dagstructuur.
            </p>
          </ExpandSection>
        </Card>
      )}

      {slechtSlapen && (
        <Card className="p-4 space-y-2">
          <SectionTitle icon={Moon} title="Slaap: sneller herstel door beter slapen" tone="purple" />
          <p className="text-sm text-muted-foreground">Slaap herstelt uw lichaam én dempt pijngevoeligheid. Kleine gewoonten maken groot verschil.</p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>Vaste tijden: sta op en ga naar bed rond hetzelfde tijdstip, ook in het weekend.</li>
            <li>Avondroutine: schermrust en dimlicht 60 min. voor slapen; korte adem-/ontspanoefening.</li>
            <li>Wakker in de nacht? Sta even op, doe iets rustigs (lezen), probeer daarna opnieuw.</li>
          </ul>
          <div className="text-xs text-muted-foreground mt-1">Tip: combineer daglicht (ochtendwandeling) met lichte dagelijkse beweging voor betere slaapkwaliteit.</div>
          <ExpandSection title="Meer uitleg">
            <p className="text-sm text-muted-foreground">
              Slechte slaap vergroot pijngevoeligheid en maakt het lastiger om vooruitgang te merken. Kleine gewoonten – regelmaat, licht, rust – hebben cumulatief veel effect. Als dutjes nodig zijn, houd ze kort (≤20 min) en niet te laat op de dag.
            </p>
          </ExpandSection>
        </Card>
      )}

      {werkLeven && (
        <Card className="p-4 space-y-2">
          <SectionTitle icon={Briefcase} title="Werk & privé: praktische balans" tone="blue" />
          <p className="text-sm text-muted-foreground">Schommelende belastbaarheid vraagt om slimme planning. Klein beginnen geeft ruimte om te groeien.</p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>Splits taken in kleine blokken; wissel zitten–staan–lopen af.</li>
            <li>Plan beweegpauzes (2–5 min) elk half uur; voorkom lange, statische belasting.</li>
            <li>Maak heldere afspraken op het werk over tijdelijk aangepaste taken en tempo.</li>
          </ul>
          <ExpandSection title="Meer uitleg">
            <p className="text-sm text-muted-foreground">
              Overleg met uw leidinggevende of casemanager over tijdelijke aanpassingen (werktijden, taken, pauzes). Een goede match tussen belasting en belastbaarheid versnelt herstel en verkleint uitval.
            </p>
          </ExpandSection>
        </Card>
      )}

      {answers.coping && (
        <Card className="p-4 space-y-2">
          <SectionTitle icon={Activity} title="Coping-stijl: advies op maat" tone="green" />
          {answers.coping === 'avoid' && (
            <>
              <p className="text-sm text-muted-foreground">Vermijding doorbreekt u het beste met mini-stappen en successen.</p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Kies 1–2 vermeden bewegingen (bijv. bukken, tillen) en oefen extreem licht.</li>
                <li>Start: 3×/dag 3 herhalingen; als dit 2–3 dagen goed gaat, voeg 1–2 herhalingen toe.</li>
                <li>Kort ongemak is oké; bij scherpe pijn of langdurige napijn stap terug.</li>
              </ul>
              <ExpandSection title="Meer uitleg">
                <p className="text-sm text-muted-foreground">
                  Door micro-stappen bouwt u vertrouwen op. Het brein registreert: “dit is veilig”. Na meerdere succesvolle herhalingen neemt de gevoeligheid vaak af. Blijf consistent, ook als het even minder gaat; kleine successen tellen.
                </p>
              </ExpandSection>
            </>
          )}
          {answers.coping === 'push_through' && (
            <>
              <p className="text-sm text-muted-foreground">Door de pijn heen beuken geeft vaak pieken en terugval. Pacing maakt herstel stabiel.</p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Gebruik een eenvoudige teller (tijd/afstand/herhalingen + napijn) en streef naar gelijkmatige dagen.</li>
                <li>Plan rustmomenten vooraf in; voorkom dat u ‘uitglijdt’ naar te veel op één dag.</li>
                <li>Doel: voorspelbare, kleine progressie met minder terugval.</li>
              </ul>
              <ExpandSection title="Meer uitleg">
                <p className="text-sm text-muted-foreground">
                  Grote pieken in activiteit zorgen vaak voor napijn en terugval. Door vooruit rust te plannen en klein te doseren blijft uw systeem rustiger. Dat levert per saldo meer herstel op in minder tijd.
                </p>
              </ExpandSection>
            </>
          )}
          {answers.coping === 'pacing' && (
            <>
              <p className="text-sm text-muted-foreground">U past al pacing toe: houd dit vast en vergroot stap voor stap.</p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Blijf variëren in houding en activiteit; vier kleine successen.</li>
                <li>Verhoog 5–10% per paar dagen als het goed gaat; bij terugval stabiliseren of een stap terug.</li>
                <li>Overweeg 1 extra activiteit toe te voegen zodra de basis stabiel voelt.</li>
              </ul>
              <ExpandSection title="Meer uitleg">
                <p className="text-sm text-muted-foreground">
                  U bent op de goede weg. Breid rustig uit en bewaak regelmatig uw schema en herstel. Als iets goed gaat, voeg één extra activiteit toe of verhoog heel klein – en waardeer de vooruitgang.
                </p>
              </ExpandSection>
            </>
          )}
        </Card>
      )}

      {(heeftCondities || heeftMedicatie) && (
        <Card className="p-4 space-y-2">
          <SectionTitle icon={PillIcon} title="Belangrijk i.v.m. aandoeningen/medicatie" tone="red" />
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {answers.conditions.values.includes('hartvaat') && (
              <li>Hart/vaat: bouw rustig op en overleg bij twijfel over intensiteit.</li>
            )}
            {answers.conditions.values.includes('diabetes') && (
              <li>Diabetes: let op hypo-/hyperklachten bij activiteit; plan eten/medicatie passend.</li>
            )}
            {answers.medication.values.includes('bloedverdunners') && (
              <li>Antistolling: kies gecontroleerde oefeningen; valpreventie is extra belangrijk.</li>
            )}
            {answers.medication.values.includes('corticosteroiden') && (
              <li>Corticosteroïden: weefsel kan gevoeliger zijn; vermijd snelle forse sprongen in belasting.</li>
            )}
            <li>Bespreek uw keuzes en doelen met uw behandelaar; samen stemmen we de opbouw veilig af.</li>
          </ul>
          <ExpandSection title="Meer uitleg">
            <p className="text-sm text-muted-foreground">
              Deze tips zijn algemeen. Uw behandelaar weegt uw persoonlijke situatie mee (comorbiditeit, medicatie, doelen) en kan de belasting nauwkeuriger doseren. Neem bij twijfel laagdrempelig contact op.
            </p>
          </ExpandSection>
        </Card>
      )}
    </div>
  );
}

async function generateFollowUps(
  answers: Answers,
  key: string,
  instruction: string,
  setQuestions: (q: FollowUpQuestion[]) => void,
  setFUAnswers: (fn: (prev: Record<string, FollowUpAnswer>) => Record<string, FollowUpAnswer>) => void,
  setLoading: (b: boolean) => void,
  setError: (e: string | null) => void,
) {
  setError(null);
  setLoading(true);
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const sys = [
      instruction,
      'Geef strikt JSON, zonder uitleg of markdown. Formaat:',
      '{ "questions": [ { "id": "string", "type": "yesno|select|multiselect|text|number", "label": "string", "options": [{"value":"string","label":"string"}]?, "placeholder": "string"? } ] }',
      'Kies vraagtypes passend bij het onderwerp. Gebruik Nederlandse labels en opties. Kies logische, bondige vragen die klinisch relevant zijn. Geef bij select/multiselect maximaal 6 opties.'
    ].join('\n');
    const prompt = `${sys}\n\nAntwoorden:\n${JSON.stringify(answers, null, 2)}`;
    const raw = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    const text = (raw.text ?? '').trim();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // try to salvage JSON between first { and last }
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const sliced = text.slice(start, end + 1);
        data = JSON.parse(sliced);
      } else {
        throw new Error('Ongeldig AI-antwoord');
      }
    }
    const questionsArr = (data as { questions?: FollowUpQuestion[] } | null)?.questions;
    const qs: FollowUpQuestion[] = Array.isArray(questionsArr) ? questionsArr.slice(0, 10) : [];
    setQuestions(qs);
    setFUAnswers(() => {
      const next: Record<string, FollowUpAnswer> = {};
      for (const q of qs) {
        next[q.id] = q.type === 'yesno' ? null : q.type === 'multiselect' ? [] : '';
      }
      return next;
    });
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : null;
    setError(msg ?? 'Er ging iets mis bij het genereren van vervolgvragen.');
  } finally {
    setLoading(false);
  }
}

function ExpandSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-2 border-t border-border">
      <button
        type="button"
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /> {title}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
