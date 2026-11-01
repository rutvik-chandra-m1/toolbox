import { Field, Input, Segmented, type SegmentedOption } from '@/shared/ui';
import type { Margin, Options, PageSize, Quality } from '../logic';

const PAGE_SIZES: SegmentedOption<PageSize>[] = [
  { value: 'fit', label: 'Fit to image' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
];

const MARGINS: SegmentedOption<Margin>[] = [
  { value: 'none', label: 'None' },
  { value: 'small', label: 'Small' },
];

const QUALITIES: SegmentedOption<Quality>[] = [
  { value: 'high', label: 'High' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'small', label: 'Small file' },
];

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-base">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-accent-600"
      />
      {label}
    </label>
  );
}

export function OptionsForm({ options, onChange }: { options: Options; onChange: (options: Options) => void }) {
  const set = (change: Partial<Options>) => onChange({ ...options, ...change });

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <Field label="File name">
        <Input value={options.filename} onChange={(event) => set({ filename: event.target.value })} />
      </Field>
      <Segmented
        legend="Page size"
        showLegend
        value={options.pageSize}
        onChange={(pageSize) => set({ pageSize })}
        options={PAGE_SIZES}
      />
      <Segmented
        legend="Margin"
        showLegend
        value={options.margin}
        onChange={(margin) => set({ margin })}
        options={MARGINS}
      />
      <Segmented
        legend="Quality"
        showLegend
        value={options.quality}
        onChange={(quality) => set({ quality })}
        options={QUALITIES}
      />
      <div>
        <Toggle label="Make text readable (OCR)" checked={options.ocr} onChange={(ocr) => set({ ocr })} />
        <Toggle label="Also save a .txt file" checked={options.saveText} onChange={(saveText) => set({ saveText })} />
      </div>
    </div>
  );
}
