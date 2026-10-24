import { z } from "zod";
import { boundedText, emailText } from "./text";

/**
 * The action catalog is owned by code, not by customers (ADR D8): an organization cannot supply a schema that
 * changes what the executor accepts. Each definition fixes the one resource it may target and a strict parameter
 * schema (unknown keys are rejected). The connector for an action is likewise fixed in code, so a request cannot
 * name a destination or a credential.
 */

export type FieldKind = "text" | "email";

export interface ActionDefinition<P extends z.ZodType = z.ZodType> {
  readonly key: string;
  readonly schemaVersion: number;
  /** The only resource this action may target. */
  readonly resource: string;
  readonly parameters: P;
  /** Fields a policy condition may reference, and how they may be compared. */
  readonly fields: Readonly<Record<string, FieldKind>>;
}

const crmLeadCreateParameters = z.strictObject({
  full_name: boundedText(120),
  email: emailText,
  company: boundedText(120),
});

export const crmLeadCreate = {
  key: "crm.lead.create",
  schemaVersion: 1,
  resource: "mockcrm/leads",
  parameters: crmLeadCreateParameters,
  fields: { full_name: "text", email: "email", company: "text" },
} as const satisfies ActionDefinition;

export const ACTION_CATALOG = {
  [crmLeadCreate.key]: crmLeadCreate,
} as const;

export type ActionKey = keyof typeof ACTION_CATALOG;

export function isActionKey(value: string): value is ActionKey {
  return Object.hasOwn(ACTION_CATALOG, value);
}

/** Shape of an action key, checked before the catalog lookup so odd strings never reach logs or queries as keys. */
export const ACTION_KEY_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/;
export const ACTION_KEY_MAX_LENGTH = 64;
