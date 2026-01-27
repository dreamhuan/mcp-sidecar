import { useState, useEffect, useRef, useImperativeHandle } from "react";
import {
  Search,
  Folder,
  FileCode,
  Loader2,
  CornerDownLeft,
} from "lucide-react"; // 新增 CornerDownLeft 图标
import { cn } from "../lib/utils";
import { API_BASE_URL } from "../common";

// 🔥 统一接口规范：与 CommandBar 保持一致
export interface FileSearchRef {
  setValue: (value: string) => void;
  getValue: () => string;
}

interface FileSearchProps {
  onSelect: (path: string) => void;
  loading?: boolean;
  // 新增 ref 转发，允许父组件控制
  // React 19: ref 直接作为 prop 传递
  ref?: React.Ref<FileSearchRef>;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

// 🔥 React 19: 不再需要 forwardRef，直接解构 ref
export function FileSearch({
  onSelect,
  loading: parentLoading,
  ref,
}: FileSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // 防抖 Timer
  const debounceRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 🔥 暴露给父组件的方法 (Standardized)
  useImperativeHandle(ref, () => ({
    setValue: (val: string) => {
      setQuery(val);
      // 可选：如果设置了值，可能希望自动聚焦或触发搜索
    },
    getValue: () => query || ".", // 如果为空，默认返回根目录 "."
  }));

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🔥 修复：重写 fetchFiles 逻辑，完美处理空输入、根目录和子目录搜索
  const fetchFiles = async (inputPath: string) => {
    let dirToFetch = ".";
    let filterPrefix = "";

    // 情况 1: 空输入 -> 列出根目录，不过滤
    if (!inputPath) {
      dirToFetch = ".";
      filterPrefix = "";
    }
    // 情况 2: 以 / 结尾 -> 明确是目录 -> 列出该目录，不过滤
    else if (inputPath.endsWith("/")) {
      dirToFetch = inputPath;
      filterPrefix = "";
    }
    // 情况 3: 正在输入文件名 (例如 "src/Ap")
    else {
      const parts = inputPath.split("/");
      // 取出最后一个部分作为过滤词 (例如 "Ap")
      filterPrefix = parts.pop() || "";
      // 剩下的部分作为目录 (例如 "src")，如果是空数组说明在根目录
      const dirPart = parts.join("/");
      dirToFetch = dirPart ? `${dirPart}/` : ".";
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverName: "internal",
          toolName: "list_directory",
          args: { path: dirToFetch },
        }),
      });
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        let items = json.data as FileEntry[];

        // 前端过滤：只有当 filterPrefix 存在时才过滤
        if (filterPrefix) {
          items = items.filter((i) =>
            i.name.toLowerCase().includes(filterPrefix.toLowerCase()),
          );
        }

        // 排序
        items.sort((a, b) => {
          if (a.isDirectory === b.isDirectory)
            return a.name.localeCompare(b.name);
          return a.isDirectory ? -1 : 1;
        });

        setResults(items);
        // 如果有结果，或者是刚初始化（空查询），都应该允许展开
        setIsOpen(items.length > 0);
      }
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 修复：useEffect 不再给默认值 "."，直接传 query
  useEffect(() => {
    // 如果是空字符串，我们也请求（列出根目录），这样一开始就有东西看
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(() => {
      fetchFiles(query); // 👈 这里改了：去掉 || "."
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // 🔥 核心修改 1: 处理项点击 -> 只填充，不执行
  const handleItemClick = (item: FileEntry) => {
    // 填充输入框
    let newPath = item.path;

    // 如果是目录，自动补全 '/'，这样用户可以立即继续打字或者看到子目录
    if (item.isDirectory && !newPath.endsWith("/")) {
      newPath += "/";
    }

    setQuery(newPath);
    inputRef.current?.focus(); // 保持焦点，方便继续输入

    // 如果是目录，点击后应该立即展示下一级内容，不需要等 debounce
    // 所以这里我们可以手动触发一次 fetch 或者利用 useEffect 的依赖更新
    // 由于 setQuery 触发了 useEffect，这里不需要额外 fetch
  };

  // 🔥 新增：智能提交逻辑
  const handleExecute = () => {
    let finalPath = query;

    // 1. 在当前结果中查找是否有完全匹配的项
    // 注意：我们要找的是“路径匹配”或者“名字匹配且就在当前目录下”
    const match = results.find(
      (r) => r.path === query || r.path === query + "/" || r.name === query,
    );

    // 2. 如果找到了，并且它是一个目录，强制补全 "/"
    // 这样 App.tsx 就会识别为 list_directory
    if (match && match.isDirectory && !finalPath.endsWith("/")) {
      finalPath += "/";
    }
    // 3. 兜底：如果没找到匹配项（可能用户手打了一个还没加载的路径），
    // 但用户输入明显像个目录（比如 src），虽然这很难判断，但通常依托于 step 1 就够了。

    setIsOpen(false);
    onSelect(finalPath);
  };

  // 修改 handleKeyDown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleExecute(); // 🔥 改用智能提交
    }
    if (e.key === "Tab" && isOpen && results.length > 0) {
      e.preventDefault();
      handleItemClick(results[0]);
    }
  };

  // 处理输入框聚焦：重新打开下拉列表
  const handleFocus = () => {
    if (results.length > 0) {
      setIsOpen(true);
    } else {
      // 如果没有结果，可能是刚进来，尝试 fetch 一下当前内容的建议
      fetchFiles(query || ".");
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus} // 🔥 聚焦时展开
          placeholder="Search files (e.g. src/components)..."
          className={cn(
            "w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none transition-all",
            "focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10",
            (loading || parentLoading) && "opacity-70",
          )}
          spellCheck={false}
          autoComplete="off"
        />

        {/* 🔥 右侧执行按钮 (Enter 指示器) */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading ? (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          ) : (
            <button
              onClick={handleExecute}
              className="p-1 hover:bg-slate-200 rounded-md transition-colors text-slate-400 hover:text-blue-600"
              title="Execute Command (Enter)"
            >
              <CornerDownLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 下拉建议列表 */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-100 shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-100 max-h-[300px] overflow-y-auto">
          {results.map((item) => (
            <button
              key={item.path}
              onClick={() => handleItemClick(item)} // 🔥 修改点击事件
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left group transition-colors border-b border-slate-50 last:border-none"
            >
              {item.isDirectory ? (
                <Folder className="w-4 h-4 text-blue-400 fill-blue-50 shrink-0" />
              ) : (
                <FileCode className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <span className="text-sm text-slate-600 truncate font-mono">
                {/* 只显示文件名，因为路径在输入框里已经有了，显示全路径会很乱，
                    或者你可以显示 item.path，看你的偏好。
                    这里建议显示 item.name，因为这是相对输入框当前目录的补全 */}
                {item.name}
              </span>

              {/* Hover 时显示 "Select" 提示 */}
              <span className="ml-auto text-[10px] text-slate-300 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                {item.isDirectory ? "Navigate" : "Select"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}