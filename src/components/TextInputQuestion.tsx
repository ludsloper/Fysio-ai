import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TextInputQuestionProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onEnter?: (value: string) => void;
}

export default function TextInputQuestion({ label, value, onChange, placeholder, onEnter }: TextInputQuestionProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            onEnter?.((e.currentTarget as HTMLInputElement).value);
          }
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
