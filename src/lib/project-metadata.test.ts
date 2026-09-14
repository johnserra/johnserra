import assert from "node:assert/strict";
import test from "node:test";
import { getProjectMetadataPaths } from "./project-metadata";

test("English-only projects advertise only the English project", () => {
  assert.deepEqual(
    getProjectMetadataPaths("en", "english-project", null),
    {
      canonical: "/projects/english-project",
      languages: {
        en: "/projects/english-project",
        "x-default": "/projects/english-project",
      },
    },
  );
});

test("translated English projects link to the translated Turkish project", () => {
  assert.deepEqual(
    getProjectMetadataPaths("en", "english-project", "turkish-project"),
    {
      canonical: "/projects/english-project",
      languages: {
        en: "/projects/english-project",
        tr: "/tr/projeler/turkish-project",
        "x-default": "/projects/english-project",
      },
    },
  );
});

test("translated Turkish projects link to the English project", () => {
  assert.deepEqual(
    getProjectMetadataPaths("tr", "turkish-project", "english-project"),
    {
      canonical: "/tr/projeler/turkish-project",
      languages: {
        tr: "/tr/projeler/turkish-project",
        en: "/projects/english-project",
        "x-default": "/projects/english-project",
      },
    },
  );
});

test("Turkish-only projects advertise only the Turkish project", () => {
  assert.deepEqual(
    getProjectMetadataPaths("tr", "turkish-project", null),
    {
      canonical: "/tr/projeler/turkish-project",
      languages: {
        tr: "/tr/projeler/turkish-project",
      },
    },
  );
});
