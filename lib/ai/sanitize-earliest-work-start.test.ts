import { describe, expect, it } from "vitest";

import {
  sanitizeEarliestWorkStart,
  splitResumeSections,
} from "@/lib/ai/sanitize-earliest-work-start";

describe("splitResumeSections", () => {
  it("buckets lines under Work vs Education headers", () => {
    const text = `
Jane Doe
Software Engineer

Education
2018 - 2022 University of Example, BSc

Work Experience
2023-06 Acme Corp Intern
2024-01 Acme Corp Developer
`;
    const { work, education } = splitResumeSections(text);
    expect(education).toContain("2018");
    expect(education).toContain("University of Example");
    expect(work).toContain("2023-06");
    expect(work).toContain("Acme Corp");
    expect(work).not.toContain("University of Example");
  });

  it("recognizes Vietnamese headers", () => {
    const text = `
Học vấn
2019 - 2023 Đại học Bách Khoa

Kinh nghiệm làm việc
2024-03 Intern tại Zen8labs
`;
    const { work, education } = splitResumeSections(text);
    expect(education).toContain("2019");
    expect(work).toContain("2024-03");
  });
});

describe("sanitizeEarliestWorkStart", () => {
  it("returns null for blank / unparseable input", () => {
    expect(sanitizeEarliestWorkStart("Work\n2020", null)).toBeNull();
    expect(sanitizeEarliestWorkStart("Work\n2020", "  ")).toBeNull();
    expect(sanitizeEarliestWorkStart("Work\n2020", "July 2020")).toBeNull();
  });

  it("rejects a year the model invented (not in the CV text)", () => {
    const cv = `
Education
2018 - 2022 Uni

Work Experience
2024 Intern
`;
    expect(sanitizeEarliestWorkStart(cv, "2010")).toBeNull();
  });

  it("rejects an education-only enrollment year (intern overcount case)", () => {
    const cv = `
Phạm Trung Tá
Developer Intern

Education
2020 - 2024 University of Technology

Work Experience
2024-06 - Present Software Intern at Company X
`;
    expect(sanitizeEarliestWorkStart(cv, "2020")).toBeNull();
    expect(sanitizeEarliestWorkStart(cv, "2020-09")).toBeNull();
  });

  it("keeps a year that appears under Work Experience", () => {
    const cv = `
Education
2018 - 2022 Uni

Work Experience
2020-03 Junior Dev at Startup
2023 Senior Dev
`;
    expect(sanitizeEarliestWorkStart(cv, "2020")).toBe("2020");
    expect(sanitizeEarliestWorkStart(cv, "2020-03")).toBe("2020-03");
  });

  it("keeps internship starts under Work / Internship headers", () => {
    const cv = `
Học vấn
2021 - 2025 ĐH Khoa học Tự nhiên

Thực tập
2024-07 Intern Backend
`;
    expect(sanitizeEarliestWorkStart(cv, "2024-07")).toBe("2024-07");
    expect(sanitizeEarliestWorkStart(cv, "2021")).toBeNull();
  });

  it("keeps the AI value when there are no section headers", () => {
    const cv = "Jane Doe\nWorked at Acme from 2022 as developer.";
    expect(sanitizeEarliestWorkStart(cv, "2022")).toBe("2022");
  });
});
