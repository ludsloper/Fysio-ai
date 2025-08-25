import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface MultiSelectQuestionProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: { value: string; label: string }[];
}

export default function MultiSelectQuestion({ label, values, onChange, options }: MultiSelectQuestionProps) {
  const handleChange = (optionValue: string) => {
    if (values.includes(optionValue)) {
      onChange(values.filter(v => v !== optionValue));
    } else {
      onChange([...values, optionValue]);
    }
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={values.includes(opt.value)} onCheckedChange={() => handleChange(opt.value)} />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
