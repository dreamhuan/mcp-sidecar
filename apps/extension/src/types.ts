import { ReactNode } from "react";

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
}

export interface ActionItem {
  id: string;
  label: string;
  server: string;
  tool: string;
  args?: any;
  promptPrefix: string;
  icon: ReactNode;
  desc: string;
}

export type ToastType = "success" | "error";
