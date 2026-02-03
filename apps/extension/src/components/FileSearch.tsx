import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  Search,
  File,
  Loader2,
  Folder,
  RefreshCw,
  ArrowUp,
  Home,
  FolderTree,
  List,
} from "lucide-react";
import { invokeAPI } from "../lib/api";
import { cn } from "../lib/utils";

export interface FileSearchRef {
  getValue: () => string;
}

interface FileSearchProps {
  onSelect: (path: string) => void;
  loading?: boolean;
}

type ViewMode = "tree" | "search";

export const FileSearch = forwardRef<FileSearchRef, FileSearchProps>(
  ({ onSelect, loading: parentLoading }, ref) => {
    const [mode, setMode] = useState<ViewMode>("tree"); // 默认层级模式
    
    // --- Search Mode State ---
    const [query, setQuery] = useState("");
    const [allFiles, setAllFiles] = useState<string[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<string[]>([]);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [searchInitialized, setSearchInitialized] = useState(false);

    // --- Tree Mode State ---
    const [currentPath, setCurrentPath] = useState(".");
    const [dirItems, setDirItems] = useState<any[]>([]);
    const [isTreeLoading, setIsTreeLoading] = useState(false);

    useImperativeHandle(ref, () => ({
      getValue: () => (mode === "search" ? query : currentPath),
    }));

    // ================= Search Mode Logic =================
    const fetchAllFiles = async () => {
      setIsSearchLoading(true);
      try {
        const res = await invokeAPI({
          serverName: "internal",
          toolName: "list_all_files",
          args: {},
        });
        if (res.success && Array.isArray(res.data)) {
          setAllFiles(res.data);
          setFilteredFiles(res.data.slice(0, 50));
          setSearchInitialized(true);
        }
      } catch (e) {
        console.error("Failed to load global file list", e);
      } finally {
        setIsSearchLoading(false);
      }
    };

    // 当切换到搜索模式且未初始化时，自动拉取
    useEffect(() => {
      if (mode === "search" && !searchInitialized) {
        fetchAllFiles();
      }
    }, [mode, searchInitialized]);

    useEffect(() => {
      if (mode !== "search") return;
      if (!query.trim()) {
        setFilteredFiles(allFiles.slice(0, 50));
        return;
      }
      const lowerQuery = query.toLowerCase();
      const matched = allFiles
        .filter((f) => f.toLowerCase().includes(lowerQuery))
        .slice(0, 50);
      setFilteredFiles(matched);
    }, [query, allFiles, mode]);

    // ================= Tree Mode Logic =================
    const fetchDirectory = async (path: string) => {
      setIsTreeLoading(true);
      try {
        const res = await invokeAPI({
          serverName: "internal",
          toolName: "list_directory",
          args: { path },
        });
        if (res.success && Array.isArray(res.data)) {
          // 排序：文件夹在前，文件在后
          const sorted = res.data.sort((a: any, b: any) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
          });
          setDirItems(sorted);
          setCurrentPath(path);
        }
      } catch (e) {
        console.error("Failed to load directory", e);
      } finally {
        setIsTreeLoading(false);
      }
    };

    // 初始化加载根目录
    useEffect(() => {
      if (mode === "tree") {
        fetchDirectory(currentPath);
      }
    }, [mode]); // 当切换回 tree 模式时，刷新当前目录

    const handleDirClick = (item: any) => {
      if (item.isDirectory) {
        fetchDirectory(item.path);
      } else {
        onSelect(item.path);
      }
    };

    const handleGoUp = () => {
      if (currentPath === ".") return;
      const parent = currentPath.split("/").slice(0, -1).join("/") || ".";
      fetchDirectory(parent);
    };

    // ================= Render =================
    return (
      <div className="bg-white border border-slate-200 rounded-[16px] shadow-sm overflow-hidden flex flex-col transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300">
        {/* Header Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
          
          {/* Mode Switcher */}
          <div className="flex bg-slate-200/50 p-0.5 rounded-lg shrink-0">
             <button
               onClick={() => setMode("tree")}
               className={cn(
                 "p-1 rounded-md transition-all",
                 mode === "tree" ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600"
               )}
               title="Hierarchical View"
             >
               <FolderTree className="w-3.5 h-3.5" />
             </button>
             <button
               onClick={() => setMode("search")}
               className={cn(
                 "p-1 rounded-md transition-all",
                 mode === "search" ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600"
               )}
               title="Global Search"
             >
               <Search className="w-3.5 h-3.5" />
             </button>
          </div>

          {/* Dynamic Header Content */}
          {mode === "search" ? (
            <div className="flex-1 flex items-center gap-2">
               <input
                type="text"
                autoFocus
                className="flex-1 bg-transparent border-none text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none"
                placeholder={searchInitialized ? "Global search..." : "Indexing..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {isSearchLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-1 overflow-hidden">
               <button 
                 onClick={() => fetchDirectory(".")}
                 className="p-1 hover:bg-slate-200 rounded shrink-0"
                 title="Go to Root"
               >
                 <Home className="w-3.5 h-3.5 text-slate-500" />
               </button>
               <button 
                 onClick={handleGoUp}
                 disabled={currentPath === "."}
                 className="p-1 hover:bg-slate-200 rounded shrink-0 disabled:opacity-30"
                 title="Go Up"
               >
                 <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
               </button>
               <div 
                 className="text-[12px] font-mono text-slate-600 truncate ml-1 px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200/50 select-text"
                 title={currentPath}
               >
                 {currentPath}
               </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="max-h-[240px] overflow-y-auto scrollbar-thin min-h-[100px]">
          {/* 1. Search Mode Results */}
          {mode === "search" && (
            <>
              {!searchInitialized && !isSearchLoading && (
                <div className="p-4 text-center text-[12px] text-slate-400">Failed to load index.</div>
              )}
              {filteredFiles.map((filePath) => (
                <button
                  key={filePath}
                  onClick={() => onSelect(filePath)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors group text-left"
                >
                  <File className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 shrink-0" />
                  <span className="text-[12px] text-slate-600 group-hover:text-slate-900 truncate font-mono">
                    {filePath}
                  </span>
                </button>
              ))}
              {searchInitialized && filteredFiles.length === 0 && (
                 <div className="p-4 text-center text-[12px] text-slate-400">No matching files.</div>
              )}
            </>
          )}

          {/* 2. Tree Mode Results */}
          {mode === "tree" && (
            <>
               {isTreeLoading ? (
                 <div className="flex items-center justify-center p-4">
                   <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                 </div>
               ) : (
                 <div className="flex flex-col">
                   {dirItems.length === 0 && (
                     <div className="p-4 text-center text-[12px] text-slate-400">Empty directory.</div>
                   )}
                   {dirItems.map((item) => (
                     <button
                       key={item.path}
                       onClick={() => handleDirClick(item)}
                       className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors group text-left"
                     >
                       {item.isDirectory ? (
                         <Folder className="w-3.5 h-3.5 text-amber-400 fill-amber-100 shrink-0" />
                       ) : (
                         <File className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 shrink-0" />
                       )}
                       <span className={cn(
                         "text-[12px] truncate font-mono",
                         item.isDirectory ? "text-slate-700 font-medium" : "text-slate-600"
                       )}>
                         {item.name}
                       </span>
                     </button>
                   ))}
                 </div>
               )}
            </>
          )}
        </div>
      </div>
    );
  },
);
