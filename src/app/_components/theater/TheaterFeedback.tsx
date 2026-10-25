"use client";

import { useTheater } from "../../_context/TheaterContext";

export function TheaterFeedback() {
  const { isAdmin, loading, feedbackError, notice } = useTheater();

  return (
    <>
      {!isAdmin && (
        <div className="mb-6 rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
          View-only access. Choose an administrator to upload files or change
          showtimes.
        </div>
      )}
      {loading && (
        <p role="status" className="mb-4 text-purple-300">
          Loading…
        </p>
      )}
      {feedbackError && (
        <p role="alert" className="mb-4 text-red-300">
          {feedbackError}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-green-300">
          {notice}
        </p>
      )}
    </>
  );
}
