export async function parseJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok
        ? "Received an invalid response from the server"
        : "Could not reach the server API. Please refresh the page and try again."
    );
  }
}
