"use client";

import Link from "next/link";
import { useState } from "react";

import {
  Avatar,
  Button,
  Card,
  Chip,
  cn,
  Input,
  Label,
  ListBox,
  Modal,
  ProgressCircle,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";

import type { CvReviewDetail, EnglishLevel } from "@/lib/candidates/cv-review-data";
import { getSourcingOptions } from "@/lib/candidates/cv-review-data";

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
      <path d="M5 3v4M19 17v4M3 5h4M17 19h4" />
    </svg>
  );
}

function ZoomInIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function UserRemoveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87M17 11l4 4m0-4-4 4" />
    </svg>
  );
}

const SOURCING = getSourcingOptions();

type Props = {
  initial: CvReviewDetail;
};

export function AiScannedCvDetailReview({ initial }: Props) {
  const [query, setQuery] = useState("");
  const [fullName, setFullName] = useState(initial.fullName);
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth);
  const [mobile, setMobile] = useState(initial.mobile);
  const [email, setEmail] = useState(initial.email);
  const [sourcing, setSourcing] = useState(initial.sourcingChannel);
  const [majorSchool, setMajorSchool] = useState(initial.majorSchool);
  const [studentYears, setStudentYears] = useState(initial.studentYears);
  const [gpa, setGpa] = useState(initial.gpa);
  const [englishLevel, setEnglishLevel] = useState<EnglishLevel>(
    initial.englishLevel,
  );
  const [skills, setSkills] = useState<string[]>(initial.skills);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const tabClass = (active: boolean) =>
    cn(
      "border-b-2 pb-2 text-sm font-semibold transition-colors",
      active
        ? "border-[#002542] text-foreground"
        : "border-transparent text-muted hover:text-foreground",
    );

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  return (
    <div className="-m-6 flex min-h-[calc(100dvh-2rem)] flex-col">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-divider bg-background/85 px-6 py-3 backdrop-blur-md">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-6">
          <Link
            href="/admin/candidates"
            className="shrink-0 text-sm font-medium text-accent hover:underline"
          >
            ← Candidates
          </Link>
          <SearchField
            value={query}
            onChange={setQuery}
            className="min-w-[200px] max-w-xs flex-1"
          >
            <SearchField.Group className="w-full rounded-full bg-surface-secondary">
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder="Search applications..."
                className="w-full min-w-0"
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <nav className="hidden items-center gap-6 sm:flex" aria-label="Scan views">
            <span className={tabClass(false)}>Recent Scans</span>
            <span className={tabClass(true)}>Queue Status</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="min-w-0 px-2" aria-label="Notifications">
            <BellIcon className="size-5 text-muted" />
          </Button>
          <Button variant="ghost" size="sm" className="min-w-0 px-2" aria-label="History">
            <HistoryIcon className="size-5 text-muted" />
          </Button>
          <Avatar className="size-8 shrink-0" size="sm">
            <Avatar.Fallback className="text-xs">
              {fullName
                .split(/\s+/)
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </Avatar.Fallback>
          </Avatar>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex w-full shrink-0 flex-col border-divider bg-surface-secondary/80 lg:w-[42%] lg:border-r lg:sticky lg:top-[52px] lg:h-[calc(100dvh-52px)] lg:overflow-y-auto">
          <div className="flex items-center justify-between p-6 pb-4">
            <h2 className="text-lg font-bold tracking-tight text-[#002542]">
              Original CV
            </h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="min-w-0 px-2" aria-label="Zoom">
                <ZoomInIcon className="size-5 text-muted" />
              </Button>
              <Button variant="ghost" size="sm" className="min-w-0 px-2" aria-label="Download CV">
                <DownloadIcon className="size-5 text-muted" />
              </Button>
            </div>
          </div>
          <div className="px-6 pb-28">
            <Card className="overflow-hidden shadow-sm">
              <div className="h-1 bg-[#a3f69c]" aria-hidden />
              <Card.Content className="min-h-[480px] space-y-8 p-8 lg:min-h-[900px]">
                <div className="space-y-2 border-b border-divider pb-6">
                  <div className="h-8 w-48 rounded bg-surface-tertiary" />
                  <div className="h-4 w-64 rounded bg-surface-secondary" />
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="col-span-1 space-y-3">
                    <div className="h-3 w-full rounded bg-surface-tertiary" />
                    <div className="h-3 w-3/4 rounded bg-surface-secondary" />
                    <div className="h-3 w-5/6 rounded bg-surface-secondary" />
                    <div className="pt-4">
                      <div className="mb-2 h-3 w-20 rounded bg-surface-tertiary" />
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="mb-1 h-2.5 w-full rounded bg-surface-secondary"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2 space-y-6">
                    {[1, 2, 3].map((block) => (
                      <div key={block} className="space-y-2">
                        <div className="h-4 w-36 rounded bg-surface-tertiary" />
                        {[1, 2, 3, 4].map((line) => (
                          <div
                            key={line}
                            className={cn(
                              "h-2.5 rounded bg-surface-secondary",
                              block === 3 && line === 4 ? "w-2/3" : "w-full",
                            )}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </Card.Content>
            </Card>
          </div>
        </section>

        <section className="min-w-0 flex-1 overflow-y-auto px-6 py-8 pb-32 lg:pb-28">
          <div className="mx-auto max-w-3xl space-y-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                AI-Scanned CV Detail Review
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {fullName}
              </h1>
              <p className="mt-1 text-sm text-muted">
                Target role:{" "}
                <span className="font-medium text-foreground">
                  {initial.targetRole}
                </span>
              </p>
            </div>

            <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#1b3b5a] to-[#002542] text-white shadow-lg">
              <Card.Content className="relative p-6">
                <div
                  className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-white/5 blur-3xl"
                  aria-hidden
                />
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="size-5 text-sky-200" />
                    <span className="text-xs font-bold uppercase tracking-widest opacity-80">
                      AI Insights &amp; Match
                    </span>
                  </div>
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
                    <div className="flex flex-col items-center sm:items-center">
                      <div className="relative flex size-24 items-center justify-center">
                        <ProgressCircle
                          aria-label={`Match score ${initial.matchScore} percent`}
                          value={initial.matchScore}
                          className="size-24 text-sky-300"
                          color="accent"
                        >
                          <ProgressCircle.Track>
                            <ProgressCircle.TrackCircle className="text-white/15" />
                            <ProgressCircle.FillCircle />
                          </ProgressCircle.Track>
                        </ProgressCircle>
                        <span className="pointer-events-none absolute text-2xl font-extrabold tabular-nums">
                          {initial.matchScore}
                        </span>
                      </div>
                      <span className="mt-1 text-[10px] font-medium uppercase opacity-70">
                        Match score
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold">{initial.insightTitle}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white/80">
                        {initial.insightBody}
                      </p>
                    </div>
                  </div>
                </div>
              </Card.Content>
            </Card>

            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-2">
                <h2 className="text-lg font-bold text-[#002542]">
                  Basic information
                </h2>
                <Chip size="sm" variant="soft" color="accent" className="text-[10px] font-bold uppercase">
                  Verified by OCR
                </Chip>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <TextField
                  value={fullName}
                  onChange={setFullName}
                  className="rounded-lg bg-sky-500/10 p-3"
                >
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                    Full name
                  </Label>
                  <Input className="mt-1 font-medium" />
                </TextField>
                <TextField
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  className="rounded-lg bg-sky-500/10 p-3"
                >
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                    Date of birth
                  </Label>
                  <Input className="mt-1 font-medium" />
                </TextField>
                <TextField value={mobile} onChange={setMobile} className="p-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                    Mobile number
                  </Label>
                  <Input className="mt-1 border-b border-divider font-medium" />
                </TextField>
                <TextField value={email} onChange={setEmail} className="p-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                    Email address
                  </Label>
                  <Input type="email" className="mt-1 border-b border-divider font-medium" />
                </TextField>
                <div className="sm:col-span-2">
                  <Select
                    value={sourcing}
                    onChange={(key) => {
                      if (typeof key === "string") setSourcing(key);
                    }}
                    className="w-full max-w-full p-3"
                  >
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                      Sourcing channel
                    </Label>
                    <Select.Trigger className="mt-1 w-full border-b border-divider">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {SOURCING.map((opt) => (
                          <ListBox.Item key={opt} id={opt} textValue={opt}>
                            {opt}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="border-b border-divider pb-2">
                <h2 className="text-lg font-bold text-[#002542]">
                  Academic background
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <TextField
                  value={majorSchool}
                  onChange={setMajorSchool}
                  className="sm:col-span-2 rounded-lg bg-sky-500/10 p-3"
                >
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                    Major / school
                  </Label>
                  <Input className="mt-1 font-medium" />
                </TextField>
                <TextField value={studentYears} onChange={setStudentYears} className="p-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                    Student years
                  </Label>
                  <Input className="mt-1 border-b border-divider font-medium" />
                </TextField>
                <TextField
                  value={gpa}
                  onChange={setGpa}
                  className="rounded-lg bg-sky-500/10 p-3"
                >
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                    GPA
                  </Label>
                  <Input className="mt-1 font-medium" />
                </TextField>
                <div className="sm:col-span-2 p-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                    English level
                  </Label>
                  <RadioGroup
                    value={englishLevel}
                    onChange={(v) => setEnglishLevel(v as EnglishLevel)}
                    name="english-level"
                    orientation="horizontal"
                    className="mt-3 flex flex-wrap gap-4"
                  >
                    <Radio value="intermediate">
                      <Radio.Control>
                        <Radio.Indicator />
                      </Radio.Control>
                      <Radio.Content>
                        <Label className="text-sm font-normal">Intermediate</Label>
                      </Radio.Content>
                    </Radio>
                    <Radio value="advanced">
                      <Radio.Control>
                        <Radio.Indicator />
                      </Radio.Control>
                      <Radio.Content>
                        <Label className="text-sm font-normal">Advanced</Label>
                      </Radio.Content>
                    </Radio>
                    <Radio value="native">
                      <Radio.Control>
                        <Radio.Indicator />
                      </Radio.Control>
                      <Radio.Content>
                        <Label className="text-sm font-normal">Native / Bilingual</Label>
                      </Radio.Content>
                    </Radio>
                  </RadioGroup>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-2">
                <h2 className="text-lg font-bold text-[#002542]">Technical skills</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs font-bold text-accent"
                  onPress={() =>
                    setSkills((prev) => [...prev, `Skill ${prev.length + 1}`])
                  }
                >
                  + Add skill
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 rounded-xl bg-sky-500/10 p-4">
                {skills.map((skill) => (
                  <Chip
                    key={skill}
                    size="sm"
                    variant="soft"
                    className="border border-divider bg-background pl-3 pr-1"
                  >
                    <Chip.Label className="text-xs font-semibold text-[#002542]">
                      {skill}
                    </Chip.Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-0 min-w-0 px-1 py-0 text-muted hover:text-foreground"
                      aria-label={`Remove ${skill}`}
                      onPress={() => removeSkill(skill)}
                    >
                      ×
                    </Button>
                  </Chip>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-wrap items-center justify-between gap-4 border-t border-divider bg-background/90 px-4 py-4 backdrop-blur-md sm:px-8 lg:left-56">
        <div className="flex min-w-0 items-center gap-3 text-muted">
          <InfoIcon className="size-5 shrink-0" />
          <p className="text-sm">
            Last edited by{" "}
            <strong className="text-foreground">{initial.lastEditedBy}</strong>{" "}
            {initial.lastEditedAgo}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            className="font-bold text-danger"
            onPress={() => setRejectOpen(true)}
          >
            <UserRemoveIcon className="size-4" />
            Reject
          </Button>
          <Button
            variant="primary"
            className="bg-gradient-to-br from-[#002542] to-[#1b3b5a] font-bold shadow-md"
          >
            Confirm &amp; add to pipeline
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>

      <Modal.Backdrop
        isOpen={rejectOpen}
        onOpenChange={setRejectOpen}
        className="bg-black/40 backdrop-blur-sm"
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-[480px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Rejection reason</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField value={rejectReason} onChange={setRejectReason}>
                <Label className="sr-only">Reason</Label>
                <TextArea
                  placeholder="Please specify why the candidate was rejected..."
                  className="min-h-32"
                />
              </TextField>
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2">
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button
                slot="close"
                variant="primary"
                className="bg-danger text-danger-foreground hover:opacity-90"
              >
                Confirm rejection
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
