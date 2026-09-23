export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

let voices: SpeechSynthesisVoice[] = []

if (ttsSupported) {
  const load = () => {
    voices = speechSynthesis.getVoices()
  }
  load()
  speechSynthesis.addEventListener?.('voiceschanged', load)
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const l = lang.toLowerCase()
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-')
  return voices.find((v) => norm(v) === l) ?? voices.find((v) => norm(v).startsWith(l.split('-')[0]))
}

export function speak(text: string, lang: string) {
  if (!ttsSupported || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  const v = pickVoice(lang)
  if (v) u.voice = v
  u.rate = 0.95
  speechSynthesis.speak(u)
}

export function stopSpeech() {
  if (ttsSupported) speechSynthesis.cancel()
}

export const TTS_LANGS: { code: string; label: string; sample: string }[] = [
  { code: 'en-US', label: 'Английский (США)', sample: 'Hello! How are you?' },
  { code: 'en-GB', label: 'Английский (Великобритания)', sample: 'Hello! How are you?' },
  { code: 'de-DE', label: 'Немецкий', sample: 'Guten Tag! Wie geht es dir?' },
  { code: 'fr-FR', label: 'Французский', sample: 'Bonjour ! Comment ça va ?' },
  { code: 'es-ES', label: 'Испанский', sample: '¡Hola! ¿Qué tal?' },
  { code: 'it-IT', label: 'Итальянский', sample: 'Ciao! Come stai?' },
  { code: 'pt-BR', label: 'Португальский (Бразилия)', sample: 'Olá! Tudo bem?' },
  { code: 'pl-PL', label: 'Польский', sample: 'Cześć! Jak się masz?' },
  { code: 'tr-TR', label: 'Турецкий', sample: 'Merhaba! Nasılsın?' },
  { code: 'nl-NL', label: 'Нидерландский', sample: 'Hallo! Hoe gaat het?' },
  { code: 'sv-SE', label: 'Шведский', sample: 'Hej! Hur mår du?' },
  { code: 'ja-JP', label: 'Японский', sample: 'こんにちは' },
  { code: 'zh-CN', label: 'Китайский', sample: '你好' },
  { code: 'ko-KR', label: 'Корейский', sample: '안녕하세요' },
  { code: 'ar-SA', label: 'Арабский', sample: 'مرحبا' },
  { code: 'hi-IN', label: 'Хинди', sample: 'नमस्ते' },
  { code: 'uk-UA', label: 'Украинский', sample: 'Привіт! Як справи?' },
  { code: 'ru-RU', label: 'Русский', sample: 'Привет! Как дела?' },
]
