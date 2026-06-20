import React from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownFilterProps {
  options: string[];
  selectedValue: string | null;
  onChange: (val: string) => void;
}

export function DropdownFilter({ options, selectedValue, onChange }: DropdownFilterProps) {
  if (options.length === 0) return null;

  return (
    <div className="relative block w-full h-full">
      <select
        value={selectedValue || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-full appearance-none bg-white/80 backdrop-blur-md border border-gray-200/80 hover:border-gray-300 text-gray-900 pl-4 pr-10 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer text-[13px] font-bold tracking-wide shadow-sm"
      >
        <option value="">すべての容量・入数</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-400">
        <ChevronDown className="w-5 h-5" />
      </div>
    </div>
  );
}
