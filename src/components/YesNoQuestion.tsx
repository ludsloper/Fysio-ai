import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface YesNoQuestionProps {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
}

export default function YesNoQuestion({ label, value, onChange }: YesNoQuestionProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={value === true ? "default" : "outline"}
          onClick={() => onChange(true)}
        >
          <Check className="w-4 h-4 mr-1" /> Ja
        </Button>
        <Button
          type="button"
          variant={value === false ? "default" : "outline"}
          onClick={() => onChange(false)}
        >
          <X className="w-4 h-4 mr-1" /> Nee
        </Button>
      </div>
    </div>
  );
}
