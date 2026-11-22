export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export function successResponse<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}
