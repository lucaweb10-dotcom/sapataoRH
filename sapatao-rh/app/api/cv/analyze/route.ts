import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";

/** Stub for the "Analisar Currículo" button. The real AI analysis is SP3. */
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "rh" && !profile.platform_admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(
    { error: "not_implemented", message: "Análise de IA chega na SP3" },
    { status: 501 },
  );
}
