import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import id from "./id";
import en from "./en";

export const LANGUAGES = [
  { code: "id", label: "Bahasa Indonesia" },
  { code: "en", label: "English" },
] as const;

i18n.use(initReactI18next).init({
  resources: {
    id: { translation: id },
    en: { translation: en },
  },
  lng: localStorage.getItem("pvc-locale") || "id",
  fallbackLng: "id",
  interpolation: { escapeValue: false },
});

export default i18n;