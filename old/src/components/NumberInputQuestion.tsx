import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumberInputQuestionProps {
  label: string;
  value: number | '';
  onChange: (value: number | '') => void;
  placeholder?: string;
}

export default function NumberInputQuestion({ label, value, onChange, placeholder }: NumberInputQuestionProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder={placeholder}
      />
    </div>
  );
}
