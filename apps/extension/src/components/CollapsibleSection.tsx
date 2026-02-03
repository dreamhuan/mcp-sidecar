import { useState, ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  icon?: ReactNode;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className,
  icon,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors group select-none px-1"
      >
        <div className="p-0.5 rounded-md hover:bg-slate-100 transition-colors">
            {isOpen ? (
            <ChevronDown className="w-4 h-4" />
            ) : (
            <ChevronRight className="w-4 h-4" />
            )}
        </div>
        
        <div className="flex items-center gap-2">
            {icon && <span className="text-slate-400 group-hover:text-blue-500 transition-colors">{icon}</span>}
            <h2 className="text-[13px] font-semibold uppercase tracking-wider">
            {title}
            </h2>
        </div>
        
        {!isOpen && (
            <div className="h-px flex-1 bg-slate-100 ml-2" />
        )}
      </button>

      {isOpen && (
        <div className="animate-in slide-in-from-top-2 duration-200 fade-in-50">
          {children}
        </div>
      )}
    </section>
  );
}
