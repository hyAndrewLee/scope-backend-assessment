import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../../page";
import { Providers } from "../../providers";
import { TheaterToolbar } from "../theater/TheaterToolbar";
import { PreviewModal } from "../PreviewModal";

test("page composes its theater provider and initial selection UI", () => {
  const html = renderToStaticMarkup(
    createElement(Providers, null, createElement(Home)),
  );

  expect(html).toContain("Theater Showtimes Manager");
  expect(html).toContain('aria-label="Demo user"');
  expect(html).toContain("Choose a demo user above to view the schedule.");
  expect(html).not.toContain("<dialog");
});

test("context consumers reject rendering outside their providers", () => {
  expect(() => renderToStaticMarkup(createElement(TheaterToolbar))).toThrow(
    "useTheater must be used within TheaterProvider.",
  );
  expect(() => renderToStaticMarkup(createElement(PreviewModal))).toThrow(
    "usePreviewSource must be used within PreviewSourceContext.",
  );
});
