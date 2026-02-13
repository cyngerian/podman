import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase-server";

export default async function RootPage() {
  const user = await getUser();

  if (!user) {
    redirect("/auth/login");
  }

  redirect("/dashboard");
}
