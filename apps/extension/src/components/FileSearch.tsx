import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  type Ref,
} from "react";
import { Search, Folder, FileCode, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { API_BASE_URL } from "../common";

interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

export interface FileSearchRef {
  getValue: () => string;
  setValue: (val: string) => void;
}

interface FileSearchProps {
  onSelect: (path: string) => void;
  loading?: boolean;
  ref?: Ref<FileSearchRef>;
}

export function FileSearch({
  onSelect,
  loading: parentLoading,
  ref,
}: FileSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<FileEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 🔥 新增：防止选中后重复搜索的锁
  const shouldSearchRef = useRef(true);

  useImperativeHandle(ref, () => ({
    getValue: () => inputValue,
    setValue: (val: string) => {
      shouldSearchRef.current = false; // 外部设置值时不触发搜索
      setInputValue(val);
    },
  }));

  useEffect(() => {
    if (showDropdown && listRef.current && selectedIndex >= 0) {
      const buttonsContainer = listRef.current.firstElementChild;
      if (buttonsContainer && buttonsContainer.children[selectedIndex]) {
        const targetBtn = buttonsContainer.children[
          selectedIndex
        ] as HTMLElement;
        targetBtn.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, showDropdown]);

  useEffect(() => {
    setSelectedIndex(-1);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [suggestions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🔥 核心修改：搜索逻辑增加锁判断
  useEffect(() => {
    // 如果是因为选中条目导致的 value 变化，跳过搜索并重置锁
    if (!shouldSearchRef.current) {
      shouldSearchRef.current = true;
      return;
    }

    if (!inputValue) {
      setSuggestions([]);
      return;
    }

    const fetchFiles = async () => {
      setIsSearching(true);
      try {
        let dirToSearch = ".";
        let filterTerm = "";

        const lastSlashIndex = inputValue.lastIndexOf("/");
        if (lastSlashIndex !== -1) {
          dirToSearch = inputValue.substring(0, lastSlashIndex);
          filterTerm = inputValue.substring(lastSlashIndex + 1);
        } else {
          filterTerm = inputValue;
        }

        if (!dirToSearch) dirToSearch = ".";

        const res = await fetch(`${API_BASE_URL}/api/invoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serverName: "fs",
            toolName: "list_directory",
            args: { path: dirToSearch },
          }),
        });

        const json = await res.json();

        if (json.success && json.isStructured) {
          const allFiles = json.data as FileEntry[];
          const filtered = allFiles
            .filter((f) =>
              f.name.toLowerCase().includes(filterTerm.toLowerCase()),
            )
            .sort((a, b) => {
              if (a.isDirectory === b.isDirectory)
                return a.name.localeCompare(b.name);
              return a.isDirectory ? -1 : 1;
            });

          setSuggestions(filtered);
          // 只有真正搜到结果且由用户输入触发时才显示
          if (filtered.length > 0) setShowDropdown(true);
        }
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(() => {
      fetchFiles();
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const handleItemAction = (item: FileEntry, isExecution: boolean) => {
    const lastSlashIndex = inputValue.lastIndexOf("/");
    const prefix =
      lastSlashIndex !== -1 ? inputValue.substring(0, lastSlashIndex + 1) : "";
    const suffix = item.name + (item.isDirectory ? "/" : "");
    const fullPath = prefix + suffix;

    // 🔥 修复关键点：
    // 只有在 "确认选择/执行" (Enter/Click) 时才锁住搜索，防止下拉框再次弹出。
    // 如果是 "Tab 补全" (isExecution=false)，我们希望搜索继续触发，以便显示下一级目录内容。
    if (isExecution) {
      shouldSearchRef.current = false;
    }

    setInputValue(fullPath);

    if (isExecution) {
      setShowDropdown(false);
      onSelect(fullPath);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
        if (suggestions[targetIndex]) {
          handleItemAction(suggestions[targetIndex], false);
        }
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();

      if (showDropdown && selectedIndex >= 0) {
        handleItemAction(suggestions[selectedIndex], true);
      } else {
        setShowDropdown(false);
        onSelect(inputValue);
      }
    }
  };

  return (
    <div className="relative z-50" ref={containerRef}>
      <div className="glass-panel p-1.5 pl-3 rounded-[18px] flex items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
        <div className="text-slate-400 flex items-center justify-center">
          {isSearching ? (
            <Loader2 className="w-[18px] h-[18px] animate-spin" />
          ) : (
            <Search className="w-[18px] h-[18px]" strokeWidth={2} />
          )}
        </div>

        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search path (Tab to complete)..."
          className="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-700 placeholder:text-slate-400/70 font-medium h-9 w-full"
          autoComplete="off"
        />

        <button
          disabled={!inputValue || parentLoading}
          onClick={() => onSelect(inputValue)}
          className="h-9 w-9 flex items-center justify-center rounded-xl bg-white shadow-sm border border-black/5 hover:bg-slate-50 active:scale-90 transition-all disabled:opacity-50 ml-auto shrink-0"
        >
          {parentLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          ) : (
            <span className="w-4 h-4 text-slate-600">↵</span>
          )}
        </button>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white/90 backdrop-blur-xl border border-white/40 shadow-xl rounded-[16px] overflow-hidden max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 scrollbar-hide"
        >
          <div className="py-1">
            {suggestions.map((item, idx) => (
              <button
                key={item.path + idx}
                onClick={() => handleItemAction(item, true)}
                className={cn(
                  "w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors group",
                  idx === selectedIndex
                    ? "bg-blue-100/80"
                    : "hover:bg-blue-50/50",
                )}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-black/5",
                    item.isDirectory
                      ? "bg-blue-100 text-blue-600"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {item.isDirectory ? (
                    <Folder className="w-4 h-4" />
                  ) : (
                    <FileCode className="w-4 h-4" />
                  )}
                </div>
                <div className="truncate flex-1">
                  <span className="text-[13px] font-medium text-slate-700 group-hover:text-blue-700">
                    {item.name}
                  </span>
                </div>
                {idx === selectedIndex && (
                  <span className="text-[10px] text-slate-400 font-medium hidden group-hover:inline-block">
                    Enter ↵
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
