/** Shape returned by every server action that a form renders. Safe to import from client components. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** A link to show the user (e.g. a supplier link to copy). */
  link?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialActionState: ActionState = {};
