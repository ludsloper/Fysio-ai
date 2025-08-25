import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TextInputQuestionProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function TextInputQuestion({ label, value, onChange, placeholder }: TextInputQuestionProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
