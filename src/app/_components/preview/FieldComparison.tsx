"use client";

import { usePreview } from "./PreviewContext";
import { displayLabel } from "~/features/reconciliation/display";
import { formatValue } from "./display";

export function FieldComparison() {
  const {
    entry,
    editable,
    fieldRows,
    formats,
    index,
    busy,
    outcomeUnknown,
    updateField,
    updateInputField,
  } = usePreview();

  if (!entry) return null;

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[440px] table-fixed text-left text-sm">
        <caption className="sr-only">
          {entry.after?.movieTitle ?? entry.original?.movieTitle}: current
          values and proposed changes. All times are UTC.
        </caption>
        <thead className="border-b border-gray-700 text-[11px] text-gray-500">
          <tr>
            <th scope="col" className="w-[24%] pb-2 font-normal">
              Detail
            </th>
            <th scope="col" className="w-[34%] px-2 pb-2 font-normal">
              {entry.before ? "Current schedule" : "From your file"}
            </th>
            <th
              scope="col"
              className="w-[42%] pb-2 pl-2 font-normal text-purple-300"
            >
              After saving{editable ? " · editable" : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {entry.kind === "archive" && (
            <tr className="border-b border-gray-800">
              <th
                scope="row"
                className="py-3 text-xs font-normal text-gray-400"
              >
                Status
              </th>
              <td className="px-2 py-3 text-gray-400">
                {displayLabel(entry.before?.status ?? "active")}
              </td>
              <td className="py-3 pl-2 text-red-300">Archived</td>
            </tr>
          )}
          {fieldRows.map(
            ({
              field,
              old,
              value,
              fromFile,
              changed,
              dateField,
              options,
              inputValue,
            }) => {
              const controlClass = `w-full min-w-0 rounded border border-transparent px-2 py-1.5 text-sm outline-none hover:border-gray-600 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 disabled:opacity-50 ${changed ? "bg-green-500/5 text-green-200" : "bg-transparent text-gray-200"}`;

              return (
                <tr key={field} className="border-b border-gray-800/70">
                  <th
                    scope="row"
                    className="py-2.5 pr-2 align-top text-xs font-normal text-gray-400"
                  >
                    {displayLabel(field)}
                  </th>
                  <td className="px-2 py-2.5 align-top text-xs break-words text-gray-400">
                    <span
                      className={
                        changed && old ? "line-through decoration-gray-600" : ""
                      }
                    >
                      {formatValue(old, field)}
                    </span>
                    {entry.before && fromFile && fromFile !== old && (
                      <span className="mt-1 block text-[11px] text-gray-500">
                        File: {formatValue(fromFile, field)}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2 align-top">
                    {editable ? (
                      <>
                        {options ? (
                          <select
                            aria-label={`${displayLabel(field)} for showtime ${index + 1}`}
                            value={options.includes(value) ? value : ""}
                            disabled={busy || outcomeUnknown || !options.length}
                            onChange={(event) =>
                              updateField(field, event.target.value)
                            }
                            className={controlClass}
                          >
                            <option value="" disabled>
                              {options.length
                                ? "Choose…"
                                : "No compatible options"}
                            </option>
                            {options.map((option) => (
                              <option
                                key={option}
                                value={option}
                                className="bg-gray-900 text-white"
                              >
                                {displayLabel(option)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            aria-label={`${displayLabel(field)} for showtime ${index + 1}`}
                            type={dateField ? "datetime-local" : "text"}
                            step={dateField ? 1 : undefined}
                            value={inputValue}
                            maxLength={256}
                            disabled={busy || outcomeUnknown}
                            onChange={(event) =>
                              updateInputField(field, event.target.value)
                            }
                            className={controlClass}
                          />
                        )}
                        {field === "format" && !formats.length && (
                          <span className="mt-1 block text-xs text-amber-300">
                            Choose a compatible auditorium or leave this change
                            out.
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="block px-2 py-1 text-xs text-gray-300">
                        {entry.after
                          ? formatValue(entry.after[field], field)
                          : "Needs a match"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            },
          )}
        </tbody>
      </table>
    </div>
  );
}
