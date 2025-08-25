// Prefilled test answers for development/testing
import type { Answers } from "@/types/answers";

export const testAnswers: Answers = {
  gender: "man",
  age: 70,
  height: 180,
  weight: 85,
  dutch: "ja",
  education: "hbo_wo",
  conditions: [],
  medication: [],
  recentSurgery: false,
  alcohol: { uses: true, amount: 2, freq: "week" },
  smoking: { uses: false, amount: 0 },
  triage: {
    afterFall: true,
    fallType: "a",
    firstTime: false,
    notFit: false,
    fever: false,
    weightLoss: false,
    nightPain: false,
    nightPainChange: false,
    incontinence: false,
    radiatingBothLegs: false,
    radiatingPastKnee: true,
    burning: true,
    shooting: false,
    numbness: false,
    suddenSymptoms: [],
    touchPain: false,
    coughWorse: false,
    chronic: false,
    morningStiffness: false,
    familyRheuma: false,
    extraSymptoms: [],
    movementHelps: false,
    nsaidHelps: false
  }
};
