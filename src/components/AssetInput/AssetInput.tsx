import { MarginProps, SizeProps } from "utils/styles"
import { Label } from "components/Label/Label"
import React, { FC } from "react"
import { InputWrapper, SInput } from "./AssetInput.styled"

export type AssetInputProps = {
  value: string
  onChange: (val: string) => void
  name: string
  label: string
  dollars: string
  unit?: string
  type?: string
  placeholder?: string
  error?: string
  withLabel?: boolean
} & SizeProps &
  MarginProps

export const AssetInput: FC<AssetInputProps> = ({
  onChange,
  value,
  label,
  type = "text",
  placeholder,
  name,
  withLabel,
  ...p
}) => {
  return (
    <>
      <Label
        id={name}
        label={label}
        error={p.error}
        withLabel={withLabel}
        {...p}
      >
        <InputWrapper dollars={p.dollars} unit={p.unit}>
          <SInput
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (e.target.validity.valid) {
                onChange(e.target.value.replace(/,/g, "."))
              }
            }}
            value={value ?? ""}
            id={name}
            type={type}
            error={p.error}
            placeholder={placeholder}
          />
        </InputWrapper>
      </Label>
    </>
  )
}