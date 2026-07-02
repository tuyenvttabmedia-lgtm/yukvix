import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

// Map language code → flag emoji
const LANG_FLAGS: Record<string, string> = {
  en: "🇬🇧",
  ja: "🇯🇵",
  ko: "🇰🇷",
  vi: "🇻🇳",
  "zh-TW": "🇹🇼",
  "zh-CN": "🇨🇳",
};

interface LanguageSwitcherProps {
  variant?: "icon" | "full";
  className?: string;
}

export function LanguageSwitcher({ variant = "icon", className }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES[0];

  const currentFlag = LANG_FLAGS[currentLang.code] ?? "🌐";

  const handleChange = (code: LanguageCode) => {
    i18n.changeLanguage(code);
    localStorage.setItem("cosplay-lang", code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === "icon" ? "icon" : "sm"}
          className={`gap-1.5 ${className ?? ""}`}
          title={currentLang.nativeLabel}
          aria-label={`Language: ${currentLang.nativeLabel}`}
        >
          {/* Flag of the currently active language */}
          <span className="text-lg leading-none select-none" aria-hidden="true">
            {currentFlag}
          </span>
          {variant === "full" && (
            <span className="text-sm font-medium">{currentLang.nativeLabel}</span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[180px] p-1">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = i18n.language === lang.code;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => handleChange(lang.code as LanguageCode)}
              className="flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded-sm"
            >
              {/* Country flag */}
              <span className="text-xl leading-none select-none w-6 text-center" aria-hidden="true">
                {LANG_FLAGS[lang.code] ?? "🌐"}
              </span>

              {/* Language name */}
              <span className={`flex-1 text-sm ${isActive ? "font-semibold text-primary" : ""}`}>
                {lang.nativeLabel}
              </span>

              {/* Active checkmark */}
              {isActive && (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
