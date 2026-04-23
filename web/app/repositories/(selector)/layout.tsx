import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import NavBar from "@/components/NavBar";

export default function RepositoriesLayout({ children }: { children: ReactNode }) {
  return <AppShell nav={<NavBar />}>{children}</AppShell>;
}
