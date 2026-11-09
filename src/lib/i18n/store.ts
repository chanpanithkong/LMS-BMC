"use client";
import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { km } from "./km";

export type Locale = "en" | "km";

export const useLocale = create<{ locale: Locale; setLocale: (locale: Locale) => void }>()(
  persist((set) => ({ locale: "en", setLocale: (locale) => set({ locale }) }), { name: "lms-locale", skipHydration: true }),
);

/** English source strings are the keys; missing Khmer entries fall back to English. */
export function translate(locale: Locale, text: string): string {
  return locale === "km" ? (km[text] ?? text) : text;
}

export function useT() {
  const locale = useLocale((s) => s.locale);
  return useCallback((text: string) => translate(locale, text), [locale]);
}
