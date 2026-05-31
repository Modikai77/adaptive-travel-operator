import { NextResponse } from "next/server";
import { specificSuggestionsPayloadSchema } from "@/lib/schemas";
import { buildSpecificsPrompt, fallbackSpecificSuggestions, type SpecificsContext } from "@/lib/specifics";

export async function POST(request: Request) {
  const context = (await request.json()) as SpecificsContext;
  const fallback = fallbackSpecificSuggestions(context);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(fallback);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You suggest concrete travel options for a family. Return valid JSON only. Never claim live verification.",
          },
          { role: "user", content: buildSpecificsPrompt(context) },
        ],
      }),
    });

    if (!response.ok) throw new Error("AI provider failed");

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = specificSuggestionsPayloadSchema.parse(JSON.parse(content));

    return NextResponse.json({
      sourceOptionId: context.rankedOption.optionId,
      sourceTitle: context.rankedOption.title,
      generatedAt: new Date().toISOString(),
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      suggestions: parsed.suggestions.sort((a, b) => a.rank - b.rank),
      caveat: parsed.caveat,
    });
  } catch {
    return NextResponse.json({
      ...fallback,
      model: "specifics-fallback",
      caveat: "Specific suggestions could not be generated, so the app returned a safe fallback structure. Check the API key and try again.",
    });
  }
}
