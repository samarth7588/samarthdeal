import type { AdminProductPost } from "../../_lib/admin-product-posts";

export type CreateDealState = {
  errorMessage: string | null;
  successMessage: string | null;
  fieldErrors: Record<string, string>;
  publishedPost?: AdminProductPost;
};

export const initialCreateDealState: CreateDealState = {
  errorMessage: null,
  successMessage: null,
  fieldErrors: {},
};

export function normalizeCreateDealState(state: Partial<CreateDealState> | null | undefined): CreateDealState {
  return {
    errorMessage: state?.errorMessage ?? null,
    successMessage: state?.successMessage ?? null,
    fieldErrors: state?.fieldErrors ?? {},
  };
}