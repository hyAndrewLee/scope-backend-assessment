import axios from "axios";
import { z } from "zod";

export function message(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = z
      .object({ error: z.string() })
      .safeParse(error.response?.data);

    if (body.success) return body.data.error;

    return "We couldn’t load the data. Please try again.";
  }

  return error instanceof Error ? error.message : "Request failed.";
}
