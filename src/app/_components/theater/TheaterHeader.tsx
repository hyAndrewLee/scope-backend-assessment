"use client";

import { useTheater } from "../../_context/TheaterContext";
import { displayLabel } from "~/features/reconciliation/display";

export function TheaterHeader() {
  const { userId, user, users, isAdmin, controlsDisabled, resetSelection } =
    useTheater();

  return (
    <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="mb-2 text-4xl font-bold text-white">
          Theater Showtimes Manager
        </h1>
        <p className="text-gray-400">
          Upload partner CSV files to manage showtimes
        </p>
      </div>
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-4">
        <p className="text-xs text-gray-500 uppercase">
          Demo user · no sign-in required
        </p>
        <div className="mt-2 flex flex-col gap-3">
          <select
            aria-label="Demo user"
            value={userId}
            onChange={(e) => resetSelection(e.target.value)}
            disabled={controlsDisabled}
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
          >
            <option value="">Select a user</option>
            {users.data?.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} ({displayLabel(candidate.role)})
              </option>
            ))}
          </select>
          {user ? (
            <div className="text-sm text-gray-400">
              <div className="flex items-center justify-between">
                <span>{user.name}</span>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${isAdmin ? "bg-purple-900 text-purple-200" : "bg-gray-700 text-gray-200"}`}
                >
                  {displayLabel(user.role)}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Theaters: {user.allTheaters ? "All" : user.theaterIds.length}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No user selected.</div>
          )}
          <button
            onClick={() => resetSelection("")}
            disabled={controlsDisabled}
            className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-300"
          >
            Clear selection
          </button>
        </div>
      </div>
    </div>
  );
}
