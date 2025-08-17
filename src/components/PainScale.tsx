import { Label } from '@/components/ui/label';

interface PainScaleProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  anchors?: [string, string];
}

export default function PainScale({ label, value, onChange, min = 0, max = 10, anchors = ['geen', 'ergst'] }: PainScaleProps) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{anchors[0]}</span>
        <span className="font-medium">{value}</span>
        <span>{anchors[1]}</span>
      </div>
    </div>
  );
}
