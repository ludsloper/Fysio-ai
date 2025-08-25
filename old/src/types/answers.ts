export type Gender = 'man' | 'vrouw' | '';
export type DutchLevel = 'ja' | 'nee' | 'hulp' | '';
export type Education = 'geen' | 'basisonderwijs' | 'praktijk_mbo1_vmbob' | 'vmbo_t_mavo_mbo2_3' | 'havo_vwo_mbo4' | 'hbo_wo' | '';

export type Condition =
  | 'osteoporose'
  | 'diabetes'
  | 'hartvaat'
  | 'copd'
  | 'schildklier'
  | 'migraine'
  | 'reuma'
  | 'crohn'
  | 'neuro'
  | 'psych'
  | 'aandacht'
  | 'kanker'
  | 'obesitas'
  | 'anders';

export type Medication =
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

export type FallType = 'a' | 'b' | 'c' | '';
export type Frequency = 'dag' | 'week' | '';

export interface Alcohol {
  uses: boolean | null;
  amount: number | '';
  freq: Frequency;
}

export interface Smoking {
  uses: boolean | null;
  amount: number | '';
}

export interface Triage {
  afterFall?: boolean;
  fallType?: FallType;
  fallOther?: string; // free text when fallType === 'c'
  firstTime?: boolean;
  notFit?: boolean;
  fever?: boolean;
  weightLoss?: boolean;
  nightPain?: boolean;
  nightPainChange?: boolean; // true = verandert met houding/beweging
  incontinence?: boolean;
  radiatingBothLegs?: boolean;
  radiatingPastKnee?: boolean;
  burning?: boolean;
  shooting?: boolean;
  numbness?: boolean;
  suddenSymptoms?: string[]; // from 7.3.1 options
  touchPain?: boolean;
  coughWorse?: boolean;
  chronic?: boolean; // >3 maanden
  morningStiffness?: boolean;
  familyRheuma?: boolean;
  extraSymptoms?: string[]; // from 8.3
  movementHelps?: boolean;
  nsaidHelps?: boolean;
}

export interface Answers {
  gender: Gender;
  age: number | '';
  height: number | '';
  weight: number | '';
  dutch: DutchLevel;
  education: Education;
  conditions: Condition[];
  otherCondition?: string;
  medication: Medication[];
  otherMedication?: string;
  recentSurgery: boolean | null;
  surgeryDate?: string;
  surgeryType?: string;
  alcohol: Alcohol;
  smoking: Smoking;
  triage: Triage;
}
