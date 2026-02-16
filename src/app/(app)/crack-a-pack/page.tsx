import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase-server";
import CrackAPackClient from "./CrackAPackClient";

export const metadata: Metadata = {
  title: "Crack a Pack",
};

export default async function CrackAPackPage() {
  const user = await getUser();
  if (!user) redirect("/auth/login");

  return <CrackAPackClient />;
}
