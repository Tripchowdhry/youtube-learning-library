import { NextResponse } from "next/server";
import { geminiConfigured, modelName } from "@/lib/gemini";
import { geminiModels } from "@/lib/gemini-models";
import { isSignedIn } from "@/lib/require-user";

// The AI models in the order they're asked, by name, so the browser can show which one is
// working: { models: ["Gemini 4 Hydrogen", "Gemini 3.8 Flash", …] }.
export async function GET() {
  if (!(await isSignedIn())) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ models: [] });
  const models = await geminiModels();
  return NextResponse.json({ models: models.map(modelName) });
}
