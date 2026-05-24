import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface DropdownProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  icon?: any;
  className?: string;
}

export default function Dropdown({ options, value, onChange, label, icon: Icon, className = "" }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-200 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500/50 shadow-lg hover:shadow-indigo-500/5 transition-all w-full justify-between"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
          {label && <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold mr-1">{label}</span>}
          <span>{selectedOption?.label}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-full min-w-[200px] origin-top-right rounded-xl bg-slate-950/95 border border-white/10 shadow-2xl backdrop-blur-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-xs font-semibold transition-all flex items-center justify-between ${
                  isSelected
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
