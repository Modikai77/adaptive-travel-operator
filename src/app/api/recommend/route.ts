import { NextResponse } from "next/server";
import { buildRecommendationPrompt, type RecommendationContext } from "@/lib/recommendation-context";
import { recommendationPayloadSchema } from "@/lib/schemas";
import { scoreOptions } from "@/lib/scoring";

export async function POST(request: Request) {
  const context = (await request.json()) as RecommendationContext;
  const fallback = scoreOptions({
    familyProfile: context.familyProfile,
    checkIn: context.checkIn,
    weather: context.weather,
    options: context.options,
  });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      ...fallback,
      model: "local-scoring",
    });
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
              "You rank daily travel options for a family. Return terse, valid JSON only. Never invent option IDs.",
          },
          { role: "user", content: buildRecommendationPrompt(context) },
        ],
      }),
    });

    if (!response.ok) throw new Error("AI provider failed");
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = recommendationPayloadSchema.parse(JSON.parse(content));

    return NextResponse.json({
      ...parsed,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    });
  } catch {
    return NextResponse.json({
      ...fallback,
      model: "local-scoring-fallback",
    });
  }
}
