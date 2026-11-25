import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderCvMarkdown } from "./cv";
import {
  CV_SUPPLEMENTS_RELATIVE_PATH,
  parseCvSyncArguments,
  syncCvFromCareerOpsMarkdown,
  validateCvPublicSupplements,
  type CvPublicSupplements,
} from "./cv-sync";

const SAMPLE_CAREER_OPS_CV = `# John Serra

Rochester, NY | private@example.com | 555-019-2834 | [LinkedIn](https://www.linkedin.com/in/johnserra/) | [johnserra.com](https://johnserra.com)

## Summary

Account manager with experience in international business development, manufacturing operations, and education.

## Experience

### Premium Parking — Rochester, NY
**Account Manager**

Nov 2022 – Present

- Work with the team to compare real-time transactions with occupancy and adjust parking rates as conditions change.
- Use Power BI dashboards to review historical occupancy and compliance data.

### Amerikan Kültür Dil Okulları — Istanbul, Turkey
**Education Coordinator**

May 2017 – Oct 2022

- Collected student data and survey responses through forms and analyzed them in Google Sheets.
- Increased student success rates and satisfaction by 20%.

### John Serra — Remote, Turkey
**Consultant**

May 2008 – Oct 2022

- Helped Turkish manufacturers develop online marketing plans, increasing lead generation for export sales by 5–10%.

### Sunwell Global Ltd — Seattle, WA
**Sales Manager**

Jun 2014 – Jul 2015

- Developed the US market for a small form, trim, and stack thermoforming machine, reaching over 90% of the viable market.

### Pakis Ambalaj A.S — Izmir, Turkey
**Operations Executive**

Oct 1998 – Apr 2014

- Used PostgreSQL to track manufacturing process data, production output, product quality, and scrap ratios.
- Oversaw certification and maintenance of ISO 9001, ISO 22000, and ISO 14000.

## Projects

### johnserra.com — Practical Analytics Publishing & Applied AI Digital Twin
[https://johnserra.com](https://johnserra.com)

- Main publishing surface with 74 English analytics articles published between Sep and Nov 2026.

### CareerTalkLab — Learner Community & AI-Assisted Skills Platform
[https://careertalklab.com](https://careertalklab.com)

- Active community platform in development helping learners build business communication and practical data analytics (\`Grain First\`) skills.

## Education

- Bachelor of Arts, Business Administration (additional coursework in Psychology) — Boğaziçi University (Bosphorus University), Istanbul, Turkey
- Associate of Arts, Business — Seattle Central Community College, Seattle, WA

## Certifications

- Teaching Practice Certificate — American Culture U.K. (Sep 2018)
- Teaching of English to Students of Other Languages (TESOL) — American Culture U.K. (Sep 2018)

## Skills

**Databases and SQL.** Created PostgreSQL and MySQL databases and wrote SQL queries to extract and analyze the data.

Power BI dashboard analysis, dynamic pricing, account management.

## Languages

English, Turkish (C2), Italian (C1), Spanish (A2).
`;

async function loadSupplements(): Promise<CvPublicSupplements> {
  const raw = JSON.parse(await readFile(CV_SUPPLEMENTS_RELATIVE_PATH, "utf8")) as unknown;
  return validateCvPublicSupplements(raw);
}

test("syncs career-ops cv.md into validated public CV while stripping contact info and current employer location", async () => {
  const supplements = await loadSupplements();
  const document = syncCvFromCareerOpsMarkdown(SAMPLE_CAREER_OPS_CV, supplements);
  const markdown = renderCvMarkdown(document);

  assert.equal(document.sections.length, 19);
  assert.doesNotMatch(markdown, /private@example\.com|555-019-2834/i);
  assert.doesNotMatch(markdown, /Rochester|Syracuse|Central New York|\bCNY\b/i);

  const parking = document.sections.find((section) => section.id === "experience-premium-parking-account-manager");
  assert.ok(parking);
  assert.deepEqual(parking.paragraphs, []);
  assert.match(parking.bullets.join(" "), /Power BI dashboards/);

  const pakis = document.sections.find((section) => section.id === "experience-pakis-operations-executive");
  assert.ok(pakis);
  assert.equal(pakis.role, "Operations Executive");
  assert.equal(pakis.organization, "Pakiş Ambalaj A.Ş.");
  assert.match(pakis.paragraphs.join(" "), /family-owned business that did not use formal titles/);
  assert.match(pakis.bullets.join(" "), /PostgreSQL/);

  const sunwell = document.sections.find((section) => section.id === "experience-sunwell-global-sales-manager");
  assert.ok(sunwell);
  assert.match(sunwell.paragraphs.join(" "), /Independent contractor/);
  assert.match(sunwell.paragraphs.join(" "), /INPAK's TS-800/);
  assert.match(sunwell.bullets.join(" "), /90%/);

  assert.ok(document.sections.some((section) => section.id === "experience-pagysa-operations-manager"));
  assert.ok(document.sections.some((section) => section.id === "project-johnserra-com"));
  assert.ok(document.sections.some((section) => section.id === "project-business-development-automation"));
  assert.ok(document.sections.some((section) => section.id === "credential-foundations-data"));

  assert.match(markdown, /Bachelor of Arts, Business Administration/);
  assert.match(markdown, /Associate of Arts, Business/);
  assert.match(markdown, /English, Turkish \(C2\), Italian \(C1\), Spanish \(A2\)\./);
  assert.match(markdown, /Listed issuer: American Culture U\.K\. Issued September 2018\./);
  assert.doesNotMatch(markdown, /U\.K\.\./);

  const ctl = document.sections.find((section) => section.id === "project-careertalklab");
  assert.deepEqual(ctl?.references, [{ label: "CareerTalkLab project", url: "https://johnserra.com/projects/careertalklab" }]);
});

test("rejects current-employer regional location leaked into Premium Parking bullets", async () => {
  const supplements = await loadSupplements();
  const leaking = SAMPLE_CAREER_OPS_CV.replace(
    "adjust parking rates as conditions change.",
    "adjust parking rates across Rochester locations.",
  );
  assert.throws(
    () => syncCvFromCareerOpsMarkdown(leaking, supplements),
    /Public boundary violation/,
  );
});

test("supports generic new roles and credentials added to career-ops cv.md without code changes", async () => {
  const supplements = await loadSupplements();
  const extended = SAMPLE_CAREER_OPS_CV
    .replace(
      "## Projects",
      "### Acme Analytics Inc. — Remote\n**Senior Data Analyst**\n\nDec 2026 – Present\n\n- Built automated reconciliation pipelines.\n\n## Projects",
    )
    .replace(
      "## Skills",
      "- SQL Analytics Certificate — Data Institute (Nov 2026)\n\n## Skills",
    );

  const document = syncCvFromCareerOpsMarkdown(extended, supplements);
  const newRole = document.sections.find((section) => section.id === "experience-acme-analytics-inc-senior-data-analyst");
  assert.ok(newRole);
  assert.equal(newRole.role, "Senior Data Analyst");
  assert.deepEqual(newRole.dates, {
    kind: "interval",
    start: { value: "2026-12", precision: "month" },
    end: null,
    ongoing: true,
    start_unknown: false,
    end_unknown: false,
  });

  const newCert = document.sections.find((section) => section.id === "credential-sql-analytics-certificate");
  assert.ok(newCert);
  assert.equal(newCert.organization, "Data Institute");
});

test("parseCvSyncArguments validates flags and source paths", () => {
  assert.deepEqual(parseCvSyncArguments([], "/tmp/cv.md"), {
    sourcePath: "/tmp/cv.md",
    check: false,
    dryRun: false,
  });
  assert.deepEqual(parseCvSyncArguments(["--source", "/custom/cv.md", "--check"], "/tmp/cv.md"), {
    sourcePath: "/custom/cv.md",
    check: true,
    dryRun: false,
  });
  assert.throws(() => parseCvSyncArguments(["--check", "--dry-run"], "/tmp/cv.md"), /cannot be combined/);
  assert.throws(() => parseCvSyncArguments(["--source"], "/tmp/cv.md"), /requires a file path/);
  assert.throws(() => parseCvSyncArguments(["--unknown"], "/tmp/cv.md"), /Unknown argument/);
});
