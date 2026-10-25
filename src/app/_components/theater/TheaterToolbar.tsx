"use client";

import { useTheater } from "../../_context/TheaterContext";
import { FileUpload } from "../FileUpload";

export function TheaterToolbar() {
  const {
    theaterId,
    theaters,
    isAdmin,
    data,
    user,
    selectTheater,
    uploadFile,
    archiveSchedule,
    refreshView,
  } = useTheater();

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <label
          htmlFor="theater"
          className="text-xs font-semibold text-gray-400 uppercase"
        >
          Theater
        </label>
        <select
          id="theater"
          value={theaterId}
          onChange={(e) => selectTheater(e.target.value)}
          disabled={!theaters.data?.length}
          className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
        >
          <option value="all">All accessible theaters</option>
          {theaters.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <FileUpload
        onFileSelect={uploadFile}
        disabled={!isAdmin || theaterId === "all" || !data}
      />
      <button
        onClick={archiveSchedule}
        disabled={!isAdmin || theaterId === "all"}
        className="rounded-lg border border-red-600 px-6 py-3 font-semibold text-red-400 disabled:opacity-50"
      >
        Clear Schedule
      </button>
      <button
        onClick={refreshView}
        disabled={!user}
        className="rounded-lg border border-gray-600 px-4 py-3 text-gray-300"
      >
        Refresh schedule
      </button>
      <div className="ml-auto text-sm text-gray-400">
        {data
          ? `${isAdmin ? `${data.activeCount} active · ` : ""}${data.total} matching showtimes`
          : ""}
      </div>
    </div>
  );
}
