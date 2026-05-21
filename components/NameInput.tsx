"use client";

interface NameInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export default function NameInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: NameInputProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <label htmlFor="great-person" className="sr-only">
        偉人名を入力してください
      </label>
      <input
        id="great-person"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled && value.trim()) {
            onSubmit();
          }
        }}
        placeholder="偉人名を入力してください（例：渋沢栄一）"
        disabled={disabled}
        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/30 disabled:cursor-not-allowed disabled:bg-gray-100"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-navy px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        生成開始
      </button>
    </div>
  );
}
