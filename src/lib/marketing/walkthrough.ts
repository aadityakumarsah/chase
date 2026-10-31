/** Fictional, consent-safe script shared by the public player and the one-time recording tool. */
export const walkthroughLines = [
  "नमस्ते, मैं Chase की AI assistant हूँ। क्या मेरी बात सुरेश जी से हो रही है?",
  "पिछली बार आपने 5 तारीख बोला था। आज कितना payment कर पाएँगे?",
  "बिल्कुल। ₹2,000 का payment link भेज देती हूँ। बाकी के लिए कौन-सी तारीख ठीक रहेगी?",
  "आपका demo payment confirm हो गया। धन्यवाद, सुरेश जी।",
] as const;

export function walkthroughAudioPath(step: number): string {
  if (!Number.isInteger(step) || step < 0 || step >= walkthroughLines.length)
    throw new RangeError("Invalid walkthrough step");
  return `/audio/walkthrough-${String(step + 1).padStart(2, "0")}.mp3`;
}
