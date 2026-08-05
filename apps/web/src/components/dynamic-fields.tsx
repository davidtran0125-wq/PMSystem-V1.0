'use client';

import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui';
import type { DynamicField } from '@/lib/types';

/**
 * Renders the category form returned by the API. Values live under
 * `dynamicValues.<key>` so the whole section can be submitted as one object.
 */
export function DynamicFields<T extends FieldValues>({
  fields,
  control,
  errors,
}: {
  fields: DynamicField[];
  control: Control<T>;
  errors?: FieldErrors<T>;
}) {
  if (!fields.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const name = `dynamicValues.${field.key}` as Path<T>;
        const message = (errors?.dynamicValues as Record<string, { message?: string }> | undefined)?.[
          field.key
        ]?.message;

        return (
          <div
            key={field.id}
            className={
              field.type === 'TEXTAREA' ? 'sm:col-span-2' : undefined
            }
          >
            <Label htmlFor={name} required={field.isRequired}>
              {field.label}
            </Label>

            <Controller
              control={control}
              name={name}
              rules={
                field.isRequired
                  ? { required: `"${field.label}" là bắt buộc` }
                  : undefined
              }
              render={({ field: rhf }) => {
                const value = rhf.value ?? '';

                switch (field.type) {
                  case 'TEXTAREA':
                    return (
                      <Textarea
                        id={name}
                        placeholder={field.placeholder ?? ''}
                        {...rhf}
                        value={value}
                      />
                    );
                  case 'SELECT':
                  case 'RADIO':
                    return (
                      <Select id={name} {...rhf} value={value}>
                        <option value="">— Chọn —</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    );
                  case 'MULTISELECT':
                    return (
                      <select
                        id={name}
                        multiple
                        className="flex min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={Array.isArray(rhf.value) ? rhf.value : []}
                        onChange={(e) =>
                          rhf.onChange(
                            Array.from(e.target.selectedOptions, (o) => o.value),
                          )
                        }
                      >
                        {(field.options ?? []).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    );
                  case 'CHECKBOX':
                    return (
                      <label className="flex h-9 items-center gap-2 text-sm">
                        <input
                          id={name}
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={rhf.value === true || rhf.value === 'true'}
                          onChange={(e) => rhf.onChange(e.target.checked)}
                        />
                        {field.helpText ?? 'Có'}
                      </label>
                    );
                  case 'NUMBER':
                  case 'DECIMAL':
                    return (
                      <Input
                        id={name}
                        type="number"
                        step={field.type === 'DECIMAL' ? 'any' : '1'}
                        placeholder={field.placeholder ?? ''}
                        {...rhf}
                        value={value}
                      />
                    );
                  case 'DATE':
                    return <Input id={name} type="date" {...rhf} value={value} />;
                  case 'DATETIME':
                    return (
                      <Input id={name} type="datetime-local" {...rhf} value={value} />
                    );
                  case 'EMAIL':
                    return <Input id={name} type="email" {...rhf} value={value} />;
                  case 'URL':
                    return <Input id={name} type="url" {...rhf} value={value} />;
                  default:
                    return (
                      <Input
                        id={name}
                        placeholder={field.placeholder ?? ''}
                        {...rhf}
                        value={value}
                      />
                    );
                }
              }}
            />

            {field.helpText && field.type !== 'CHECKBOX' ? (
              <p className="mt-1 text-xs text-muted-foreground">{field.helpText}</p>
            ) : null}
            <FieldError message={message} />
          </div>
        );
      })}
    </div>
  );
}
