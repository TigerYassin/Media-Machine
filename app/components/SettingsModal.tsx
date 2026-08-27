"use client";

import { useState } from "react";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  SCRIPT_MODELS,
  IMAGE_MODELS,
  ELEVENLABS_VOICES,
  saveSettings,
} from "../lib/settings";

const STYLES    = ["TikTok Ad", "Cinematic", "Documentary", "Luxury Brand", "Funny Meme", "Startup Promo"];
const LENGTHS   = ["30s", "60s", "90s", "2min"];
const PLATFORMS = ["Instagram Post", "Instagram Story", "TikTok Cover", "Twitter / X", "LinkedIn", "YouTube Thumbnail", "Facebook Post"];
const IMG_STYLES = ["Photorealistic", "Cinematic", "Illustration", "3D Render", "Minimalist", "Neon / Cyberpunk", "Vintage / Retro", "Bold & Graphic"];
const IMG_TONES  = ["Professional", "Fun & Playful", "Luxury", "Bold & Energetic", "Calm & Serene", "Dark & Dramatic"];

interface Props {
  settings: AppSettings;
  onClose: () => void;
  onChange: (s: AppSettings) => void;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
    </div>
  );
}

function TierBadge({ tier, label }: { tier: "free" | "paid"; label?: string }) {
  if (tier === "free") {
    return (
      <span className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
        {label ?? "Free"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-400">Paid</span>
  );
}

export function SettingsModal({ settings, onClose, onChange }: Props) {
  const [local, setLocal] = useState<AppSettings>(settings);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setLocal((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      onChange(next);
      return next;
    });
  }

  function reset() {
    setLocal(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    onChange(DEFAULT_SETTINGS);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative my-8 w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">

        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-bold text-zinc-100">Settings</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="text-xs text-zinc-500 transition hover:text-zinc-300"
            >
              Reset to defaults
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>

        <div className="space-y-8 px-6 py-6">

          {/* ── Script & Storyboard Model ── */}
          <section>
            <SectionHeader
              title="Script & Storyboard Model"
              subtitle="Generates your video plan from the script. Free models need a Groq API key — no OpenAI credits required."
            />
            <div className="grid gap-2">
              {SCRIPT_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                    local.scriptModel === m.id
                      ? "border-indigo-500 bg-indigo-600/10"
                      : "border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="scriptModel"
                    value={m.id}
                    checked={local.scriptModel === m.id}
                    onChange={() => update("scriptModel", m.id)}
                    className="mt-0.5 accent-indigo-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-100">{m.name}</span>
                      <span className="text-xs text-zinc-500">{m.provider}</span>
                      <TierBadge tier={m.tier} />
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{m.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* ── Image Generation Model ── */}
          <section>
            <SectionHeader
              title="Image Generation Model"
              subtitle="Used in the Creative Image Engine. All options require an OpenAI API key."
            />
            <div className="grid gap-2">
              {IMAGE_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                    local.imageModel === m.id
                      ? "border-pink-500 bg-pink-600/10"
                      : "border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="imageModel"
                    value={m.id}
                    checked={local.imageModel === m.id}
                    onChange={() => update("imageModel", m.id)}
                    className="mt-0.5 accent-pink-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-100">{m.name}</span>
                      <TierBadge tier={m.tier} />
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{m.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* ── Video Generation ── */}
          <section>
            <SectionHeader
              title="Video Generation (Kling AI)"
              subtitle="Quality mode for each generated scene. Pro is higher quality; Standard is faster and cheaper."
            />
            <div className="grid grid-cols-2 gap-2">
              {(["pro", "standard"] as const).map((mode) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                    local.klingMode === mode
                      ? "border-violet-500 bg-violet-600/10"
                      : "border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="klingMode"
                    value={mode}
                    checked={local.klingMode === mode}
                    onChange={() => update("klingMode", mode)}
                    className="accent-violet-500"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold capitalize text-zinc-100">{mode}</span>
                      {mode === "standard" && (
                        <TierBadge tier="free" label="Cheaper" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {mode === "pro" ? "Best quality, slower" : "Faster, lower cost"}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* ── Voiceover ── */}
          <section>
            <SectionHeader
              title="Voiceover (ElevenLabs)"
              subtitle="Voice and pacing used for all scene narration."
            />
            <select
              value={local.voiceId}
              onChange={(e) => update("voiceId", e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
            >
              {ELEVENLABS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.description}
                </option>
              ))}
            </select>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-300">Speech Rate</label>
                <span className="font-mono text-sm text-zinc-400">{local.wordsPerSecond.toFixed(1)} words/sec</span>
              </div>
              <input
                type="range"
                min={1.5}
                max={4.0}
                step={0.1}
                value={local.wordsPerSecond}
                onChange={(e) => update("wordsPerSecond", parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="mt-1 flex justify-between text-xs text-zinc-600">
                <span>1.5 — slow</span>
                <span>2.5 — Rachel default</span>
                <span>4.0 — fast</span>
              </div>
            </div>
          </section>

          {/* ── Default Video Settings ── */}
          <section>
            <SectionHeader title="Default Video Settings" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-zinc-400">Video Style</label>
                <select
                  value={local.defaultVideoStyle}
                  onChange={(e) => update("defaultVideoStyle", e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                >
                  {STYLES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-zinc-400">Video Length</label>
                <select
                  value={local.defaultVideoLength}
                  onChange={(e) => update("defaultVideoLength", e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                >
                  {LENGTHS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* ── Default Image Settings ── */}
          <section>
            <SectionHeader title="Default Image Settings" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-zinc-400">Platform</label>
                <select
                  value={local.defaultImagePlatform}
                  onChange={(e) => update("defaultImagePlatform", e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                >
                  {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-zinc-400">Visual Style</label>
                <select
                  value={local.defaultImageStyle}
                  onChange={(e) => update("defaultImageStyle", e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                >
                  {IMG_STYLES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-zinc-400">Tone</label>
                <select
                  value={local.defaultImageTone}
                  onChange={(e) => update("defaultImageTone", e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
                >
                  {IMG_TONES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-zinc-400">Number of images</label>
                <div className="flex gap-2">
                  {[1, 2, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => update("defaultImageCount", n)}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                        local.defaultImageCount === n
                          ? "border-pink-500 bg-pink-600/20 text-pink-300"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
