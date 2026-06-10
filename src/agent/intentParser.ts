import OpenAI from "openai";
import { ParseResult } from "../types.js";

const client = new OpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a transaction intent parser for an Ethereum spending agent.
Extract transfer details from natural language input.

Return ONLY valid JSON with exactly these fields:
- to_address: string (Ethereum address starting with 0x)
- amount_eth: number (float, amount in ETH)
- network: string (one of: "ethereum", "sepolia")
- memo: string (brief description of the transfer purpose)

If any required field is missing or cannot be determined, return:
{"error": "explanation of what is missing"}

Do not include any text outside the JSON.`;

export async function parseIntent(userInput: string): Promise<ParseResult> {
  const response = await client.chat.completions.create({
    model: "grok-3-mini",
    max_tokens: 256,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userInput },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { error: `Could not extract JSON from model response: ${text}` };
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (parsed.error) {
    return { error: parsed.error };
  }

  return { intent: parsed };
}
