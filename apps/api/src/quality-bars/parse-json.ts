/** Extract the first JSON object from model output (fenced or raw). */
export function parseJsonObjectFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model output did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
