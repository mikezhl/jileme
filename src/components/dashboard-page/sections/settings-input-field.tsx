import { type ComponentPropsWithoutRef } from "react";

type SettingsInputFieldProps = Omit<ComponentPropsWithoutRef<"input">, "value" | "aria-label"> & {
  label: string;
  maskedValue?: string | null;
  value: string;
};

export function SettingsInputField({
  label,
  maskedValue = null,
  placeholder,
  value,
  ...props
}: SettingsInputFieldProps) {
  const showMaskedValue = value.length === 0 && Boolean(maskedValue);

  return (
    <div className={`settings-input-shell${showMaskedValue ? " has-saved-value" : ""}`}>
      <input
        {...props}
        aria-label={label}
        placeholder={showMaskedValue ? "" : placeholder}
        value={value}
      />
      {showMaskedValue ? (
        <span className="settings-input-overlay" aria-hidden="true">
          {maskedValue}
        </span>
      ) : null}
    </div>
  );
}
