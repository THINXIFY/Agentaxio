"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Form primitives. <Field> owns the id wiring so label, hint and error are always
 * programmatically associated with the control (aria-describedby / aria-invalid).
 */

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

function useFieldProps(): Record<string, unknown> {
  const ctx = React.useContext(FieldContext);
  if (!ctx) return {};
  return {
    id: ctx.id,
    "aria-describedby": ctx.describedBy,
    "aria-invalid": ctx.invalid || undefined,
    required: ctx.required || undefined,
  };
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, error, required = false, className, children }: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {required ? (
            <span aria-hidden="true" className="text-danger-text">
              {" "}
              *
            </span>
          ) : null}
        </label>
        {children}
        {hint ? (
          <p id={hintId} className="text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-sm font-medium text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

const controlBase =
  "w-full rounded-control border border-input-border bg-surface-sunken px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-200 ease-standard " +
  "hover:border-primary-text focus-visible:border-primary-text focus-visible:outline-2 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-10", className)} {...useFieldProps()} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(controlBase, "min-h-24 py-2 leading-relaxed", className)}
      {...useFieldProps()}
      {...props}
    />
  );
}

/** Native <select>: best accessibility and mobile behaviour; styled to match. */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(controlBase, "h-10 pr-8", className)} {...useFieldProps()} {...props}>
      {children}
    </select>
  );
}
