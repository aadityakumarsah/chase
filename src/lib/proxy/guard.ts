const banned = [
  /\bpolice\b/i,
  /\bFIR\b/i,
  /\bcourt\b/i,
  /legal action/i,
  /\bjail\b/i,
  /blacklist/i,
  /credit[- ]?score/i,
  /visit(?:ing)? (?:your )?(?:shop|home)/i,
  /(?:tell|contact|call) (?:your )?(?:family|neighbou?r|employer)/i,
  /पुलिस/u,
  /एफ\.?आई\.?आर/u,
  /अदालत/u,
  /कानूनी कार्रवाई/u,
  /जेल/u,
  /ब्लैकलिस्ट/u,
  /क्रेडिट स्कोर/u,
  /घर (?:आ|आए|आऊ)/u,
  /दुकान (?:आ|आए|आऊ)/u,
  /परिवार|पड़ोस(?:ी|ियों)|मालिक को बता/u,
  /\b(?:idiot|stupid|bastard)\b/i,
  /बेहूदा|बेवकूफ/u,
];

export function guardSentence(sentence: string) {
  const unsafe = banned.some((pattern) => pattern.test(sentence));
  if (!unsafe) return { text: sentence, rewritten: false };
  return {
    text: /[\u0900-\u097f]/u.test(sentence)
      ? "मैं सम्मान से केवल आपके account के practical options पर बात कर सकती हूँ।"
      : "I can only discuss practical account options respectfully.",
    rewritten: true,
  };
}

export function takeCompleteSentences(buffer: string) {
  const match = /[.!?।\n]/gu;
  let end = 0;
  for (const item of buffer.matchAll(match))
    end = (item.index ?? 0) + item[0].length;
  return { complete: buffer.slice(0, end), remainder: buffer.slice(end) };
}
